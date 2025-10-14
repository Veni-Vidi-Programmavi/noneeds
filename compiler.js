#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

class PSLTokenizer {
  constructor(input) {
    this.input = input;
    this.pos = 0;
    this.tokens = [];
  }

  tokenize() {
    while (this.pos < this.input.length) {
      this.skipWhitespace();
      if (this.pos >= this.input.length) break;

      if (this.match('//')) {
        this.skipLineComment();
        continue;
      }
      if (this.match('/*')) {
        this.skipBlockComment();
        continue;
      }

      const char = this.input[this.pos];

      if (char === '#') {
        this.tokens.push({ type: 'HASH', value: '#' });
        this.pos++;
      } else if (/[a-zA-Z_]/.test(char)) {
        this.readIdentifier();
      } else if (/\d/.test(char)) {
        this.readNumber();
      } else if (char === '"' || char === "'") {
        this.readString();
      } else if ('{}()[];:,=.'.includes(char)) {
        this.tokens.push({ type: 'SYMBOL', value: char });
        this.pos++;
      } else {
        this.pos++;
      }
    }
    this.tokens.push({ type: 'EOF', value: '' });
    return this.tokens;
  }

  skipWhitespace() {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
      this.pos++;
    }
  }

  skipLineComment() {
    while (this.pos < this.input.length && this.input[this.pos] !== '\n') {
      this.pos++;
    }
  }

  skipBlockComment() {
    this.pos += 2;
    while (this.pos < this.input.length - 1) {
      if (this.input[this.pos] === '*' && this.input[this.pos + 1] === '/') {
        this.pos += 2;
        break;
      }
      this.pos++;
    }
  }

  match(str) {
    return this.input.substr(this.pos, str.length) === str;
  }

  readIdentifier() {
    let value = '';
    while (this.pos < this.input.length && /[a-zA-Z0-9_]/.test(this.input[this.pos])) {
      value += this.input[this.pos];
      this.pos++;
    }
    this.tokens.push({ type: 'IDENTIFIER', value });
  }

  readNumber() {
    let value = '';
    while (this.pos < this.input.length && /[\d.]/.test(this.input[this.pos])) {
      value += this.input[this.pos];
      this.pos++;
    }
    this.tokens.push({ type: 'NUMBER', value });
  }

  readString() {
    const quote = this.input[this.pos];
    this.pos++;
    let value = '';
    while (this.pos < this.input.length && this.input[this.pos] !== quote) {
      if (this.input[this.pos] === '\\') {
        this.pos++;
        const escaped = this.input[this.pos];
        value += escaped === 'n' ? '\n' : escaped === 't' ? '\t' : escaped;
      } else {
        value += this.input[this.pos];
      }
      this.pos++;
    }
    this.pos++;
    this.tokens.push({ type: 'STRING', value });
  }
}

class PSLParser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  parse() {
    const ast = {
      type: 'Program',
      metadata: {},
      pages: {},
      functions: {},
      globalVariables: {},
      statements: []
    };

    while (!this.isAtEnd()) {
      this.skipWhitespace();
      
      if (this.peek().type === 'HASH') {
        this.pos++;
        const key = this.expect('IDENTIFIER').value;
        this.expect('SYMBOL', '=');
        const value = this.parseExpression();
        ast.metadata[key] = value;
        if (this.peek().value === ';') this.pos++;
      } else if (this.peek().type === 'IDENTIFIER') {
        const name = this.peek().value;
        const lookAhead = this.peekAhead(1);
        
        if (lookAhead.value === '(') {
          // Function or element
          if (this.peekAhead(2).value === '{') {
            this.expect('IDENTIFIER');
            ast.functions[name] = this.parseFunction();
          } else {
            this.pos++;
          }
        } else if (lookAhead.value === '{') {
          // Page
          this.expect('IDENTIFIER');
          ast.pages[name] = this.parsePage();
        } else if (lookAhead.value === '=') {
          // Global variable
          this.expect('IDENTIFIER');
          this.expect('SYMBOL', '=');
          const value = this.parseExpression();
          ast.globalVariables[name] = value;
          if (this.peek().value === ';') this.pos++;
        } else {
          this.pos++;
        }
      } else if (this.peek().value === 'if') {
        // Top-level if statement
        ast.statements.push(this.parseIf());
      } else if (this.peek().value === 'for') {
        // Top-level for statement
        ast.statements.push(this.parseFor());
      } else {
        this.pos++;
      }
    }

    return ast;
  }

  parseFor() {
    this.expect('IDENTIFIER'); // for
    this.expect('SYMBOL', '(');
    const varName = this.expect('IDENTIFIER').value;
    this.expect('IDENTIFIER'); // in or =
    const collection = this.parseExpression();
    this.expect('SYMBOL', ')');
    this.expect('SYMBOL', '{');
    const body = this.parseBlock();
    this.expect('SYMBOL', '}');
    
    return { type: 'for', varName, collection, body };
  }

  parseFunction() {
    this.expect('SYMBOL', '(');
    const params = [];
    
    while (this.peek().value !== ')') {
      params.push(this.expect('IDENTIFIER').value);
      if (this.peek().value === ',') {
        this.pos++;
      }
    }
    
    this.expect('SYMBOL', ')');
    this.expect('SYMBOL', '{');
    const body = this.parseBlock();
    this.expect('SYMBOL', '}');
    
    return { params, body };
  }

  parsePage() {
    this.expect('SYMBOL', '{');
    const elements = [];
    
    while (this.peek().value !== '}' && !this.isAtEnd()) {
      this.skipWhitespace();
      if (this.peek().value === '}') break;
      
      const el = this.parseTopLevelElement();
      if (el) elements.push(el);
    }
    
    this.expect('SYMBOL', '}');
    return { elements };
  }

  parseTopLevelElement() {
    if (this.peek().type !== 'IDENTIFIER') return null;
    
    const elementName = this.peek().value;
    this.pos++; // consume identifier
    
    this.expect('SYMBOL', '(');
    
    let props = {};
    let directText = null;
    
    // Parse arguments inside () - can be just a string or nothing
    if (this.peek().type === 'STRING') {
      directText = this.parseExpression();
      props.text = directText;
    }
    
    this.expect('SYMBOL', ')');
    
    let children = [];
    let handlers = [];

    // Parse body { ... } - properties, handlers, nested elements, conditions
    if (this.peek().value === '{') {
      this.pos++;
      while (this.peek().value !== '}' && !this.isAtEnd()) {
        this.skipWhitespace();
        if (this.peek().value === '}') break;
        
        const token = this.peek();
        const nextToken = this.peekAhead(1);
        
        // Event handler: onClick { ... }
        if (token.type === 'IDENTIFIER' && ['onClick', 'onHover', 'onChange', 'onFocus', 'onBlur', 'onSubmit'].includes(token.value) && nextToken.value === '{') {
          const eventName = this.expect('IDENTIFIER').value;
          handlers.push(this.parseEventHandler(eventName));
        }
        // If statement: if (condition) { ... }
        else if (token.value === 'if' && nextToken.value === '(') {
          this.pos++;
          this.expect('SYMBOL', '(');
          const condition = this.parseExpression();
          this.expect('SYMBOL', ')');
          this.expect('SYMBOL', '{');
          const ifChildren = [];
          while (this.peek().value !== '}' && !this.isAtEnd()) {
            this.skipWhitespace();
            if (this.peek().value === '}') break;
            const el = this.parseTopLevelElement();
            if (el) ifChildren.push(el);
          }
          this.expect('SYMBOL', '}');
          children.push({ type: 'if', condition, children: ifChildren });
        }
        // Property assignment: key: value; OR just key; (for boolean flags)
        else if (token.type === 'IDENTIFIER' && nextToken.value === ':') {
          const key = this.expect('IDENTIFIER').value;
          this.expect('SYMBOL', ':');
          const value = this.parseExpression();
          props[key] = value;
          if (this.peek().value === ';') this.pos++;
        }
        // Boolean flag: just key; (without : or =)
        else if (token.type === 'IDENTIFIER' && nextToken.value === ';') {
          const key = this.expect('IDENTIFIER').value;
          this.expect('SYMBOL', ';');
          props[key] = { type: 'boolean', value: true };
        }
        // Nested element: name(...)
        else if (token.type === 'IDENTIFIER' && nextToken.value === '(') {
          const el = this.parseTopLevelElement();
          if (el) children.push(el);
        }
        else {
          this.pos++;
        }
      }
      this.expect('SYMBOL', '}');
    }

    return {
      type: 'Element',
      name: elementName,
      props,
      children,
      handlers
    };
  }

  parseInlineProperties() {
    const props = {};
    
    while (this.peek().value !== ')' && !this.isAtEnd()) {
      this.skipWhitespace();
      if (this.peek().value === ')') break;
      
      if (this.peek().type !== 'IDENTIFIER') {
        this.pos++;
        continue;
      }
      
      const key = this.peek().value;
      this.pos++;
      
      if (this.peek().value === ':') {
        this.pos++;
        const value = this.parseExpression();
        props[key] = value;
        if (this.peek().value === ';') this.pos++;
      }
    }
    
    return props;
  }

  parseEventHandler(eventName) {
    this.expect('SYMBOL', '{');
    const actions = [];
    
    while (this.peek().value !== '}' && !this.isAtEnd()) {
      this.skipWhitespace();
      if (this.peek().value === '}') break;
      
      if (this.peek().type === 'IDENTIFIER') {
        const name = this.peek().value;
        const next = this.peekAhead(1);
        
        // Check for element.property: value or element.property;
        if (next.value === '.' && this.peekAhead(2).type === 'IDENTIFIER') {
          const elemName = this.expect('IDENTIFIER').value;
          this.expect('SYMBOL', '.');
          const propName = this.expect('IDENTIFIER').value;
          
          // With value: element.property: value;
          if (this.peek().value === ':') {
            this.pos++;
            const value = this.parseExpression();
            actions.push({ 
              type: 'assignment', 
              key: `${elemName}.${propName}`, 
              value 
            });
          }
          // Boolean flag: element.property;
          else if (this.peek().value === ';') {
            this.pos++;
            actions.push({ 
              type: 'assignment', 
              key: `${elemName}.${propName}`, 
              value: { type: 'boolean', value: true }
            });
          }
        }
        // Regular assignment: key: value;
        else if (next.value === ':') {
          const key = this.expect('IDENTIFIER').value;
          this.expect('SYMBOL', ':');
          const value = this.parseExpression();
          actions.push({ type: 'assignment', key, value });
          if (this.peek().value === ';') this.pos++;
        }
        // Boolean flag: key;
        else if (next.value === ';') {
          const key = this.expect('IDENTIFIER').value;
          this.expect('SYMBOL', ';');
          actions.push({ type: 'assignment', key, value: { type: 'boolean', value: true } });
        }
        else {
          this.pos++;
        }
      } else {
        this.pos++;
      }
    }
    
    this.expect('SYMBOL', '}');
    return { event: eventName, actions };
  }

  parseBlock() {
    const statements = [];
    
    while (this.peek().value !== '}' && !this.isAtEnd()) {
      this.skipWhitespace();
      if (this.peek().value === '}') break;
      
      if (this.peek().type === 'IDENTIFIER' && this.peekAhead(1).value === '(') {
        const funcName = this.expect('IDENTIFIER').value;
        this.expect('SYMBOL', '(');
        const args = [];
        while (this.peek().value !== ')') {
          args.push(this.parseExpression());
          if (this.peek().value === ',') this.pos++;
        }
        this.expect('SYMBOL', ')');
        statements.push({ type: 'functionCall', name: funcName, args });
        if (this.peek().value === ';') this.pos++;
      } else if (this.peek().value === 'if') {
        statements.push(this.parseIf());
      } else if (this.peek().type === 'IDENTIFIER' && this.peekAhead(1).value === '=') {
        const varName = this.expect('IDENTIFIER').value;
        this.expect('SYMBOL', '=');
        const value = this.parseExpression();
        statements.push({ type: 'assignment', varName, value });
        if (this.peek().value === ';') this.pos++;
      } else {
        this.pos++;
      }
    }
    
    return statements;
  }

  parseIf() {
    this.expect('IDENTIFIER'); // if
    this.expect('SYMBOL', '(');
    const condition = this.parseExpression();
    this.expect('SYMBOL', ')');
    this.expect('SYMBOL', '{');
    const body = this.parseBlock();
    this.expect('SYMBOL', '}');
    
    return { type: 'if', condition, body };
  }

  parseExpression() {
    const token = this.peek();
    
    if (token.type === 'STRING') {
      this.pos++;
      return { type: 'string', value: token.value };
    }
    if (token.type === 'NUMBER') {
      this.pos++;
      return { type: 'number', value: token.value };
    }
    if (token.type === 'IDENTIFIER') {
      const value = token.value;
      if (value === 'true' || value === 'false') {
        this.pos++;
        return { type: 'boolean', value: value === 'true' };
      }
      if (value === 'red' || value === 'blue' || value === 'green' || value === 'white' || value === 'black') {
        this.pos++;
        return { type: 'string', value };
      }
      this.pos++;
      
      // Check for dot notation (var.property)
      if (this.peek().value === '.') {
        this.pos++;
        const property = this.expect('IDENTIFIER').value;
        return { type: 'dotNotation', object: value, property };
      }
      
      return { type: 'variable', value };
    }
    
    return { type: 'null', value: null };
  }

  skipWhitespace() {
    while (this.pos < this.tokens.length && /\s/.test(this.tokens[this.pos].value || '')) {
      this.pos++;
    }
  }

  expect(type, value = null) {
    const token = this.peek();
    if (token.type !== type || (value && token.value !== value)) {
      throw new Error(`Expected ${type}${value ? ` (${value})` : ''}, got ${token.type} (${token.value}) at position ${this.pos}`);
    }
    this.pos++;
    return token;
  }

  peek() {
    return this.tokens[this.pos] || { type: 'EOF', value: '' };
  }

  peekAhead(n) {
    return this.tokens[this.pos + n] || { type: 'EOF', value: '' };
  }

  isAtEnd() {
    return this.peek().type === 'EOF';
  }
}

class PSLCompiler {
  constructor(ast) {
    this.ast = ast;
    this.elementId = 0;
  }

  compile() {
    return this.generateHTML();
  }

  generateHTML() {
    const css = this.generateCSS();
    const js = this.generateJavaScript();

    return `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#2196F3">
    <title>${this.getMetadata('name') || 'App'}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; }
        [data-page] { display: none; }
        [data-page].active { display: block; }
        ${css}
    </style>
</head>
<body>
    <div id="app">
        ${this.generatePages()}
    </div>
    <script>
        ${js}
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register(
                'data:application/javascript;base64,${Buffer.from(this.generateServiceWorker()).toString('base64')}',
                { scope: '/' }
            ).catch(e => console.log('SW error:', e));
        }
    </script>
</body>
</html>`;
  }

  generateServiceWorker() {
    return `self.addEventListener('install', e => e.waitUntil(self.skipWaiting()));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => e.respondWith(fetch(e.request).catch(() => new Response('Offline'))));`;
  }

  generateCSS() {
    return `
      body { background: #f5f5f5; font-family: Arial, sans-serif; margin: 0; padding: 0; }
      [data-page] { padding: 20px; display: flex; flex-direction: column; }
      button { padding: 10px 15px; cursor: pointer; background: #2196F3; color: white; border: none; border-radius: 4px; }
      button:hover { background: #1976D2; }
      input { padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
      h1, h2, h3 { margin: 10px 0; }
      p { margin: 8px 0; }
      div, h1, h2, h3, p, button, input { box-sizing: border-box; }
    `;
  }

  generatePages() {
    let html = '';
    const pageNames = Object.keys(this.ast.pages);
    
    for (const pageName of pageNames) {
      const page = this.ast.pages[pageName];
      html += `<div data-page="${pageName}" class="page ${pageName === pageNames[0] ? 'active' : ''}">`;
      html += page.elements.map((el, idx) => {
        // Store element reference in global scope if it has children or handlers
        if (el.children.length > 0 || el.handlers.length > 0) {
          return this.generateElement(el, pageName, idx);
        }
        return this.generateElement(el, pageName);
      }).join('\n');
      html += `</div>`;
    }
    return html;
  }

  generateElement(el, pageName) {
    const tag = this.getElementTag(el.name);
    const id = `el_${this.elementId++}`;
    let html = `<${tag} id="${id}"`;

    // Build style and classes
    let styles = [];
    let hasPositioning = false;
    let justifyContent = null;
    let alignItems = null;
    let flexDirection = 'row';
    let elementVarName = null;

    // Apply properties as styles or attributes
    for (const [key, value] of Object.entries(el.props)) {
      const strValue = this.valueToString(value);
      
      if (key === 'text') {
        // Will be added as content
      } else if (key === 'var') {
        // Store element reference
        elementVarName = strValue;
      } else if (key === 'size') {
        styles.push(`font-size: ${strValue}px`);
      } else if (key === 'font') {
        styles.push(`font-family: ${strValue}`);
      } else if (key === 'radius') {
        styles.push(`border-radius: ${strValue}px`);
      } else if (key === 'border-color') {
        styles.push(`border-color: ${strValue}`);
      } else if (key === 'border-size') {
        styles.push(`border-width: ${strValue}px`);
        styles.push(`border-style: solid`);
      } else if (key === 'bg') {
        styles.push(`background-color: ${strValue}`);
      } else if (key === 'color') {
        styles.push(`color: ${strValue}`);
      } else if (key === 'show') {
        if (strValue === 'false' || strValue === '0') {
          styles.push(`display: none`);
        }
      } else if (key === 'hide') {
        if (strValue === 'true' || strValue === '1') {
          styles.push(`display: none`);
        }
      }
      // Flexbox positioning
      else if (key === 'center') {
        if (strValue === 'true' || strValue === '1') {
          hasPositioning = true;
          justifyContent = 'center';
          alignItems = 'center';
          styles.push(`display: flex`);
        }
      } else if (key === 'left') {
        hasPositioning = true;
        justifyContent = 'flex-start';
        styles.push(`display: flex`);
      } else if (key === 'right') {
        hasPositioning = true;
        justifyContent = 'flex-end';
        styles.push(`display: flex`);
      } else if (key === 'top') {
        hasPositioning = true;
        flexDirection = 'column';
        alignItems = 'flex-start';
        styles.push(`display: flex`);
      } else if (key === 'bottom') {
        hasPositioning = true;
        flexDirection = 'column';
        alignItems = 'flex-end';
        styles.push(`display: flex`);
      } else if (key === 'width') {
        styles.push(`width: ${strValue}px`);
      } else if (key === 'height') {
        styles.push(`height: ${strValue}px`);
      } else if (key === 'padding') {
        styles.push(`padding: ${strValue}px`);
      } else if (key === 'margin') {
        styles.push(`margin: ${strValue}px`);
      } else if (key === 'gap') {
        styles.push(`gap: ${strValue}px`);
      } else {
        html += ` data-${key}="${strValue}"`;
      }
    }

    // Apply flexbox settings
    if (hasPositioning) {
      styles.push(`flex-direction: ${flexDirection}`);
      if (justifyContent) styles.push(`justify-content: ${justifyContent}`);
      if (alignItems) styles.push(`align-items: ${alignItems}`);
    }

    if (styles.length > 0) {
      html += ` style="${styles.join('; ')}"`;
    }

    html += `>`;

    // Add text content
    if (el.props && el.props.text) {
      html += this.valueToString(el.props.text);
    }

    // Add child elements
    if (el.children && el.children.length > 0) {
      for (const child of el.children) {
        if (child.type === 'if') {
          // Conditionally render
          if (this.evaluateCondition(child.condition)) {
            html += child.children.map(c => this.generateElement(c, pageName)).join('\n');
          }
        } else {
          html += this.generateElement(child, pageName);
        }
      }
    }

    html += `</${tag}>`;

    // Add event handlers and store element reference
    let handlerCode = '';
    if (el.handlers && el.handlers.length > 0 || elementVarName) {
      handlerCode = `
        (function() {
          const el = document.getElementById('${id}');
          if (!el) return;
          ${elementVarName ? `window.psl_elements.${elementVarName} = el;` : ''}
          ${el.handlers.map(h => {
            const eventName = h.event.replace('on', '').toLowerCase();
            const actions = h.actions.map(a => this.actionToJS(a, id)).join('\n');
            return `el.addEventListener('${eventName}', function() { ${actions} });`;
          }).join('\n')}
        })();
      `;
      html += `<script>${handlerCode}</script>`;
    }

    return html;
  }

  actionToJS(action, elementId) {
    if (action.type === 'assignment') {
      const key = action.key;
      const value = this.valueToJSString(action.value);
      
      // Check if it's a dot notation: elementVar.property = value
      if (key.includes('.')) {
        const [elemName, prop] = key.split('.');
        return `
          if (window.psl_elements && window.psl_elements['${elemName}']) {
            const el = window.psl_elements['${elemName}'];
            const propValue = ${value};
            console.log('Modifying ${elemName}.${prop} to', propValue);
            if ('${prop}' === 'text') {
              el.textContent = propValue;
            } else if ('${prop}' === 'bg') {
              el.style.backgroundColor = propValue;
            } else if ('${prop}' === 'color') {
              el.style.color = propValue;
            } else if ('${prop}' === 'size') {
              el.style.fontSize = propValue + 'px';
            } else if ('${prop}' === 'hide') {
              el.style.display = (propValue === true || propValue === 1 || propValue === '1') ? 'none' : 'block';
            } else if ('${prop}' === 'show') {
              el.style.display = (propValue === false || propValue === 0 || propValue === '0') ? 'none' : 'block';
            } else if ('${prop}' === 'radius') {
              el.style.borderRadius = propValue + 'px';
            } else if ('${prop}' === 'border-size') {
              el.style.borderWidth = propValue + 'px';
            } else if ('${prop}' === 'border-color') {
              el.style.borderColor = propValue;
            } else if ('${prop}' === 'padding') {
              el.style.padding = propValue + 'px';
            } else if ('${prop}' === 'margin') {
              el.style.margin = propValue + 'px';
            } else {
              el.setAttribute('data-' + '${prop}', propValue);
            }
          } else {
            console.warn('Element ${elemName} not found in psl_elements');
          }
        `;
      } else {
        return `window.psl_vars.${key} = ${value};`;
      }
    }
    return '';
  }

  evaluateCondition(cond) {
    if (cond.type === 'boolean') return cond.value;
    if (cond.type === 'variable') return window[cond.value];
    return false;
  }

  generateJavaScript() {
    let js = `window.psl_vars = {}; window.psl_elements = {};`;
    
    // Global variables
    for (const [name, value] of Object.entries(this.ast.globalVariables)) {
      js += `window.psl_vars.${name} = ${this.valueToJSString(value)};`;
    }

    // Functions
    for (const [funcName, func] of Object.entries(this.ast.functions)) {
      const params = func.params.join(', ');
      const body = func.body.map(stmt => this.statementToJS(stmt)).join('\n');
      js += `window.${funcName} = function(${params}) { ${body} };`;
    }

    // Top-level statements (if, for, etc.)
    if (this.ast.statements && this.ast.statements.length > 0) {
      for (const stmt of this.ast.statements) {
        js += this.statementToJS(stmt);
      }
    }

    // Page switching
    js += `window.showPage = function(name) {
      document.querySelectorAll('[data-page]').forEach(p => p.classList.remove('active'));
      const p = document.querySelector('[data-page="' + name + '"]');
      if (p) p.classList.add('active');
    };`;

    return js;
  }

  statementToJS(stmt) {
    if (stmt.type === 'assignment') {
      return `window.psl_vars.${stmt.varName} = ${this.valueToJSString(stmt.value)};`;
    }
    if (stmt.type === 'functionCall') {
      const args = stmt.args.map(a => this.valueToJSString(a)).join(', ');
      return `window.${stmt.name}(${args});`;
    }
    if (stmt.type === 'if') {
      const cond = this.valueToJSString(stmt.condition);
      const body = stmt.body.map(s => this.statementToJS(s)).join('\n');
      return `if (${cond}) { ${body} }`;
    }
    if (stmt.type === 'for') {
      const varName = stmt.varName;
      const coll = this.valueToJSString(stmt.collection);
      const body = stmt.body.map(s => this.statementToJS(s)).join('\n');
      return `for (let ${varName} of ${coll}) { ${body} }`;
    }
    return '';
  }

  valueToString(value) {
    if (!value) return '';
    if (value.type === 'string') return value.value;
    if (value.type === 'number') return String(value.value);
    if (value.type === 'boolean') return value.value ? 'true' : 'false';
    if (value.type === 'variable') return String(value.value);
    return '';
  }

  valueToJSString(value) {
    if (!value) return 'null';
    if (value.type === 'string') return `"${value.value.replace(/"/g, '\\"')}"`;
    if (value.type === 'number') return value.value;
    if (value.type === 'boolean') return value.value ? 'true' : 'false';
    if (value.type === 'variable') return `window.psl_vars.${value.value}`;
    return 'null';
  }

  getMetadata(key) {
    const val = this.ast.metadata[key];
    if (val && val.type === 'string') return val.value;
    if (val && val.type === 'variable') return val.value;
    return null;
  }

  getElementTag(name) {
    const tagMap = {
      title: 'h1',
      text: 'p',
      button: 'button',
      input: 'input',
      image: 'img',
      container: 'div',
      box: 'div'
    };
    return tagMap[name] || 'div';
  }
}

// CLI
function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: psl-compiler <input.psl> [--output <output.html>]');
    process.exit(1);
  }

  const inputFile = args[0];
  let outputFile = 'output.html';

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) {
      outputFile = args[i + 1];
    }
  }

  try {
    console.log(`📖 Lecture du fichier: ${inputFile}`);
    const source = fs.readFileSync(inputFile, 'utf-8');
    
    console.log('🔄 Tokenization...');
    const tokenizer = new PSLTokenizer(source);
    const tokens = tokenizer.tokenize();
    console.log(`✓ ${tokens.length} tokens générés`);
    
    console.log('📝 Parsing...');
    const parser = new PSLParser(tokens);
    const ast = parser.parse();
    console.log(`✓ AST généré`);
    
    console.log('⚙️  Compilation...');
    const compiler = new PSLCompiler(ast);
    const html = compiler.compile();
    console.log(`✓ HTML généré`);
    
    fs.writeFileSync(outputFile, html);
    console.log(`✅ Compilation réussie: ${outputFile}`);
  } catch (err) {
    console.error(`❌ Erreur: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

main();