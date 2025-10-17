#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// --- PSLTokenizer ---

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

      // Gestion des opérateurs à deux caractères
      if (this.match('==')) {
        this.tokens.push({ type: 'OPERATOR', value: '==' });
        this.pos += 2;
        continue;
      }
      if (this.match('!=')) {
        this.tokens.push({ type: 'OPERATOR', value: '!=' });
        this.pos += 2;
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

// --- PSLParser ---

class PSLParser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
    this.ast = null; 
  }

  parse() {
    const ast = {
      type: 'Program',
      metadata: {},
      pages: {},
      functions: {},
      globalVariables: {},
      statements: [],
      keyHandlers: [] 
    };
    
    this.ast = ast; 

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
        
        if (name === 'onKey' && lookAhead.value === '(') {
          ast.keyHandlers.push(this.parseKeyHandler());
        }
        else if (lookAhead.value === '(') {
          if (this.peekAhead(2).value === '{') {
            this.expect('IDENTIFIER');
            ast.functions[name] = this.parseFunction();
          } else {
            this.pos++;
          }
        } else if (lookAhead.value === '{') {
          this.expect('IDENTIFIER');
          ast.pages[name] = this.parsePage();
        } else if (lookAhead.value === '=') {
          this.expect('IDENTIFIER');
          this.expect('SYMBOL', '=');
          const value = this.parseExpression();
          ast.globalVariables[name] = value;
          if (this.peek().value === ';') this.pos++;
        } else {
          this.pos++;
        }
      } else if (this.peek().value === 'if') {
        ast.statements.push(this.parseIf());
      } else if (this.peek().value === 'for') {
        ast.statements.push(this.parseFor());
      } else {
        this.pos++;
      }
    }

    return ast;
  }
  
  parseKeyHandler() {
    this.expect('IDENTIFIER', 'onKey');
    this.expect('SYMBOL', '(');
    const keyExpression = this.parseExpression(); 
    this.expect('SYMBOL', ')');
    
    this.expect('SYMBOL', '{');
    const actions = this.parseEventHandlerBody(); 
    this.expect('SYMBOL', '}');

    return { type: 'keyHandler', key: keyExpression, actions };
  }


  parseFor() {
    this.expect('IDENTIFIER'); 
    this.expect('SYMBOL', '(');
    const varName = this.expect('IDENTIFIER').value;
    this.expect('IDENTIFIER'); 
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
      
      const token = this.peek();
      const nextToken = this.peekAhead(1);

      if (token.value === 'onKey' && nextToken.value === '(') {
          this.ast.keyHandlers.push(this.parseKeyHandler());
          continue; 
      }
      
      const el = this.parseTopLevelElement();
      if (el) elements.push(el);
    }
    
    this.expect('SYMBOL', '}');
    return { elements };
  }

  // HELPER : pour parser un bloc d'éléments (enfants)
  parseElementBlock() {
      const elements = [];
      while (this.peek().value !== '}' && !this.isAtEnd()) {
          this.skipWhitespace();
          if (this.peek().value === '}') break;
          const el = this.parseTopLevelElement();
          if (el) elements.push(el);
      }
      return elements;
  }


  parseTopLevelElement() {
    if (this.peek().type !== 'IDENTIFIER') return null;
    
    const elementName = this.peek().value;
    const lookAhead = this.peekAhead(1);

    if (elementName === 'onKey' && lookAhead.value === '(') {
        return null; 
    }
    
    this.pos++; 
    
    this.expect('SYMBOL', '(');
    
    let props = {};
    let directText = null;
    
    if (this.peek().type === 'STRING') {
      directText = this.parseExpression();
      props.text = directText;
    }
    
    this.expect('SYMBOL', ')');
    
    let children = [];
    let handlers = [];

    if (this.peek().value === '{') {
      this.pos++;
      while (this.peek().value !== '}' && !this.isAtEnd()) {
        this.skipWhitespace();
        if (this.peek().value === '}') break;
        
        const token = this.peek();
        const nextToken = this.peekAhead(1);
        
        if (token.type === 'IDENTIFIER' && ['onClick', 'onHover', 'onChange', 'onFocus', 'onBlur', 'onSubmit'].includes(token.value) && nextToken.value === '{') {
          const eventName = this.expect('IDENTIFIER').value;
          handlers.push(this.parseEventHandler(eventName));
        }
        // Gestion complète des éléments structurels IF/ELSE
        else if (token.value === 'if' && nextToken.value === '(') {
          this.pos++; 

          this.expect('SYMBOL', '(');
          const condition = this.parseExpression();
          this.expect('SYMBOL', ')');
          this.expect('SYMBOL', '{');
          const ifChildren = this.parseElementBlock();
          this.expect('SYMBOL', '}');

          let elseChildren = null;
          if (this.peek().value === 'else') {
              this.pos++; // Consume 'else'
              this.expect('SYMBOL', '{');
              elseChildren = this.parseElementBlock();
              this.expect('SYMBOL', '}');
          }

          children.push({ type: 'if', condition, children: ifChildren, elseChildren });
        }
        else if (token.type === 'IDENTIFIER' && nextToken.value === ':') {
          const key = this.expect('IDENTIFIER').value;
          this.expect('SYMBOL', ':');
          const value = this.parseExpression();
          props[key] = value;
          if (this.peek().value === ';') this.pos++;
        }
        else if (token.type === 'IDENTIFIER' && nextToken.value === ';') {
          const key = this.expect('IDENTIFIER').value;
          this.expect('SYMBOL', ';');
          props[key] = { type: 'boolean', value: true };
        }
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

  // Ajout de la gestion de l'instruction 'if' et de l'affectation implicite sans ; ou :
  parseEventHandlerBody() {
    const actions = [];
    
    while (this.peek().value !== '}' && !this.isAtEnd()) {
      this.skipWhitespace();
      if (this.peek().value === '}') break;
      
      const token = this.peek();
      const next = this.peekAhead(1);
      
      // 1. Prioriser l'instruction IF 
      if (token.value === 'if' && next.value === '(') {
        actions.push(this.parseIf());
        continue; 
      }
      
      if (token.type === 'IDENTIFIER') {
        const name = token.value;
        
        // 2. Appel de fonction (ex: log("message"))
        if (next.value === '(') {
            this.pos++; 
            this.expect('SYMBOL', '(');
            const args = [];
            while (this.peek().value !== ')') {
                args.push(this.parseExpression());
                if (this.peek().value === ',') this.pos++;
            }
            this.expect('SYMBOL', ')');
            actions.push({ type: 'functionCall', name, args });
            if (this.peek().value === ';') this.pos++;
            continue;
        }
        
        // 3. Check for element.property: value or element.property;
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
          // Boolean flag: element.property; (avec point-virgule)
          else if (this.peek().value === ';') {
            this.pos++;
            actions.push({ 
              type: 'assignment', 
              key: `${elemName}.${propName}`, 
              value: { type: 'boolean', value: true }
            });
          }
          // Boolean flag implicite (sans symbole, comme super.hide)
          else {
             actions.push({ 
              type: 'assignment', 
              key: `${elemName}.${propName}`, 
              value: { type: 'boolean', value: true }
            });
          }
          continue;
        }
        // 4. Regular assignment: key: value;
        else if (next.value === ':') {
          const key = this.expect('IDENTIFIER').value;
          this.expect('SYMBOL', ':');
          const value = this.parseExpression();
          actions.push({ type: 'assignment', key, value });
          if (this.peek().value === ';') this.pos++;
          continue;
        }
        // 5. Boolean flag: key;
        else if (next.value === ';') {
          const key = this.expect('IDENTIFIER').value;
          this.expect('SYMBOL', ';');
          actions.push({ type: 'assignment', key, value: { type: 'boolean', value: true } });
          continue;
        }
        else {
          this.pos++;
        }
      } else {
        this.pos++;
      }
    }
    
    return actions;
  }

  parseEventHandler(eventName) {
    this.expect('SYMBOL', '{');
    const actions = this.parseEventHandlerBody();
    this.expect('SYMBOL', '}');
    return { event: eventName, actions };
  }

  // Mise à jour de parseBlock pour l'affectation implicite
  parseBlock() {
    const statements = [];
    
    while (this.peek().value !== '}' && !this.isAtEnd()) {
      this.skipWhitespace();
      if (this.peek().value === '}') break;
      
      // 1. Prioriser l'instruction 'if'
      if (this.peek().value === 'if') {
        statements.push(this.parseIf());
      } 
      // 2. Traiter les appels de fonction
      else if (this.peek().type === 'IDENTIFIER' && this.peekAhead(1).value === '(') {
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
      } 
      // 3. Traiter les assignations avec '='
      else if (this.peek().type === 'IDENTIFIER' && this.peekAhead(1).value === '=') {
        const varName = this.expect('IDENTIFIER').value;
        this.expect('SYMBOL', '=');
        const value = this.parseExpression();
        statements.push({ type: 'assignment', varName, value });
        if (this.peek().value === ';') this.pos++;
      } 
      // 4. Traiter les booléens implicites avec ';' (par exemple: super;)
      else if (this.peek().type === 'IDENTIFIER' && this.peekAhead(1).value === ';') {
        const varName = this.expect('IDENTIFIER').value;
        this.expect('SYMBOL', ';');
        statements.push({ type: 'assignment', varName, value: { type: 'boolean', value: true } });
      }
      else {
        this.pos++;
      }
    }
    
    return statements;
  }

  // Gestion complète de l'instruction IF/ELSE pour les actions et les statements
  parseIf() {
    this.expect('IDENTIFIER', 'if'); 
    this.expect('SYMBOL', '(');
    const condition = this.parseExpression();
    this.expect('SYMBOL', ')');
    this.expect('SYMBOL', '{');
    // NOTE: parseEventHandlerBody est utilisé ici car il gère les actions d'éléments (element.prop: value)
    // même s'il est appelé depuis parseBlock (pour les fonctions) ou parseEventHandlerBody (pour les handlers).
    const body = this.parseEventHandlerBody(); 
    this.expect('SYMBOL', '}');

    let elseBody = null;
    if (this.peek().value === 'else') {
        this.pos++; // Consume 'else'
        this.expect('SYMBOL', '{');
        elseBody = this.parseEventHandlerBody(); 
        this.expect('SYMBOL', '}');
    }
    
    return { type: 'if', condition, body, elseBody };
  }

  // Gère les expressions de comparaison
  parseExpression() {
    let left = this.parsePrimary();

    const operatorToken = this.peek();
    if (operatorToken.type === 'OPERATOR' && (operatorToken.value === '==' || operatorToken.value === '!=')) {
      this.pos++; 
      const operator = operatorToken.value;
      const right = this.parseExpression(); 

      return {
        type: 'binaryExpression',
        operator: operator,
        left: left,
        right: right
      };
    }

    return left;
  }

  // parsePrimary pour lire les valeurs de base
  parsePrimary() {
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
      
      this.pos++;
      
      // Check for dot notation (element.property or variable.property)
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

// --- PSLCompiler ---

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
    <script>
        // Initialize global objects FIRST
        window.psl_vars = {};
        window.psl_elements = {};
    </script>
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
        if ('serviceWorker' in navigator && location.protocol === 'https:') {
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
      h1, h2, h3, p { margin: 10px 0; }
      div, h1, h2, h3, p, button, input { box-sizing: border-box; }
    `;
  }

  generatePages() {
    let html = '';
    const pageNames = Object.keys(this.ast.pages);
    
    for (const pageName of pageNames) {
      const page = this.ast.pages[pageName];
      html += `<div data-page="${pageName}" class="page ${pageName === pageNames[0] ? 'active' : ''}">`;
      html += page.elements.map((el) => {
        return this.generateElement(el, pageName);
      }).join('\n');
      html += `</div>`;
    }
    return html;
  }

  getStyleValue(key, strValue) {
      if (['width', 'height', 'size', 'border-size', 'padding', 'margin', 'gap', 'radius'].includes(key)) {
          // Check if the value contains a unit (vw, vh, %, etc.)
          if (/[a-zA-Z%]$/.test(strValue)) {
              return strValue;
          }
          // Default to 'px' if only a number is provided
          return `${strValue}px`;
      }
      return strValue;
  }

  generateElement(el, pageName) {
    const tag = this.getElementTag(el.name);
    const id = `el_${this.elementId++}`;
    let html = `<${tag} id="${id}"`;

    let styles = [];
    let hasPositioning = false;
    let justifyContent = null;
    let alignItems = null;
    let flexDirection = 'row';
    let elementVarName = null;

    for (const [key, value] of Object.entries(el.props)) {
      const strValue = this.valueToString(value);
      
      if (key === 'text') {
      } else if (key === 'var') {
        elementVarName = strValue;
      } else if (key === 'size') {
        styles.push(`font-size: ${this.getStyleValue(key, strValue)}`);
      } else if (key === 'font') {
        styles.push(`font-family: ${strValue}`);
      } else if (key === 'radius') {
        styles.push(`border-radius: ${this.getStyleValue(key, strValue)}`);
      } else if (key === 'border-color') {
        styles.push(`border-color: ${strValue}`);
      } else if (key === 'border-size') {
        styles.push(`border-width: ${this.getStyleValue(key, strValue)}`);
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
        styles.push(`width: ${this.getStyleValue(key, strValue)}`);
      } else if (key === 'height') {
        styles.push(`height: ${this.getStyleValue(key, strValue)}`);
      } else if (key === 'padding') {
        styles.push(`padding: ${this.getStyleValue(key, strValue)}`);
      } else if (key === 'margin') {
        styles.push(`margin: ${this.getStyleValue(key, strValue)}`);
      } else if (key === 'gap') {
        styles.push(`gap: ${this.getStyleValue(key, strValue)}`);
      } else {
        html += ` data-${key}="${strValue}"`;
      }
    }

    if (hasPositioning) {
      styles.push(`flex-direction: ${flexDirection}`);
      if (justifyContent) styles.push(`justify-content: ${justifyContent}`);
      if (alignItems) styles.push(`align-items: ${alignItems}`);
    }

    if (styles.length > 0) {
      html += ` style="${styles.join('; ')}"`;
    }

    html += `>`;

    if (el.props && el.props.text) {
      html += this.valueToString(el.props.text);
    }

    if (el.children && el.children.length > 0) {
      for (const child of el.children) {
        // CORRIGÉ: Utilisation de la visibilité dynamique au lieu de document.write
        if (child.type === 'if') {
          const condJS = this.valueToJSString(child.condition);
          const ifBlockId = `if_block_${this.elementId++}`;
          const elseBlockId = `else_block_${this.elementId++}`;

          // --- 1. Rendu du bloc IF (initialement masqué) ---
          const ifChildrenHTML = child.children.map(c => this.generateElement(c, pageName)).join('');
          // Utilisation d'un conteneur div avec des marges nulles pour ne pas perturber la mise en page
          html += `<div id="${ifBlockId}" class="psl-if-block" style="display: none; margin-top: 0; margin-bottom: 0;">\n${ifChildrenHTML}\n</div>`;

          // --- 2. Rendu du bloc ELSE (initialement masqué, si présent) ---
          let elseBlockHtml = '';
          if (child.elseChildren && child.elseChildren.length > 0) {
              const elseChildrenHTML = child.elseChildren.map(c => this.generateElement(c, pageName)).join('');
              elseBlockHtml = `<div id="${elseBlockId}" class="psl-else-block" style="display: none; margin-top: 0; margin-bottom: 0;">\n${elseChildrenHTML}\n</div>`;
              html += elseBlockHtml;
          }
          
          // --- 3. Ajout du script pour vérifier la condition et définir la visibilité ---
          // Ce script s'exécute à l'initialisation du DOM.
          let scriptContent = `
            const ifEl = document.getElementById('${ifBlockId}');
            ${child.elseChildren && child.elseChildren.length > 0 ? `const elseEl = document.getElementById('${elseBlockId}');` : ''}
            
            // Fonction pour évaluer et mettre à jour l'affichage
            function updateConditionalDisplay() {
                if (${condJS}) {
                    if (ifEl) ifEl.style.display = 'block';
                    ${child.elseChildren && child.elseChildren.length > 0 ? `if (elseEl) elseEl.style.display = 'none';` : ''}
                } else {
                    if (ifEl) ifEl.style.display = 'none';
                    ${child.elseChildren && child.elseChildren.length > 0 ? `if (elseEl) elseEl.style.display = 'block';` : ''}
                }
            }
            updateConditionalDisplay();
            // TODO: (Amélioration future) Ajouter un observateur de variables pour la réactivité
          `;

          html += `<script>(function() { ${scriptContent} })();</script>`;

        } else {
          html += this.generateElement(child, pageName);
        }
      }
    }

    html += `</${tag}>`;

    let handlerCode = '';
    
    if (el.handlers.length > 0 || elementVarName) {
      handlerCode = `
        (function() {
          const el = document.getElementById('${id}');
          if (!el) return;
          ${elementVarName ? `window.psl_elements.${elementVarName} = el;` : ''}
          
          ${el.handlers.map(h => {
            const eventName = h.event.replace('on', '').toLowerCase();
            const actions = h.actions.map(a => this.actionToJS(a, id)).join('');
            return `el.addEventListener('${eventName}', function() { ${actions} });`;
          }).join('\n')}
        })();
      `;
      html += `<script>${handlerCode}</script>`;
    }

    return html;
  }

  // Correction: La logique IF pour les actions est déplacée ici (depuis statementToJS)
  actionToJS(action, elementId) {
    if (action.type === 'assignment') {
      const key = action.key;
      const value = this.valueToJSString(action.value);
      
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
        return `window.psl_vars.${key} = ${value};\n`;
      }
    } 
    // GESTION DES APPELS DE FONCTION (log, alert, custom)
    else if (action.type === 'functionCall') {
        const args = action.args.map(a => this.valueToJSString(a)).join(', ');
        
        if (action.name === 'log') {
          return `console.log(${args});\n`;
        }
        if (action.name === 'alert') {
          return `alert(${args});\n`;
        }
        
        return `window.${action.name}(${args});\n`;
    }
    // Gestion des instructions IF dans les actions (appel récursif)
    else if (action.type === 'if') {
        const cond = this.valueToJSString(action.condition); 
        // Compilation du corps IF en utilisant actionToJS
        const ifBody = action.body.map(s => this.actionToJS(s, elementId)).join('');
        let js = `if (${cond}) { ${ifBody} }`;

        if (action.elseBody && action.elseBody.length > 0) {
            // Compilation du corps ELSE en utilisant actionToJS
            const elseBody = action.elseBody.map(s => this.actionToJS(s, elementId)).join('');
            js += ` else { ${elseBody} }`;
        }
        
        return js + '\n';
    }

    return '';
  }


  generateJavaScript() {
    let js = `// Global variables initialization already done in head\n`;
    
    // Global variables
    for (const [name, value] of Object.entries(this.ast.globalVariables)) {
      js += `window.psl_vars.${name} = ${this.valueToJSString(value)};\n`;
    }

    // Functions
    for (const [funcName, func] of Object.entries(this.ast.functions)) {
      const params = func.params.join(', ');
      // Correction: Utiliser actionToJS pour le corps des fonctions si nécessaire, mais ici
      // on suppose que les fonctions sont composées de statements (affectations de variables globales et appels de fonctions).
      const body = func.body.map(stmt => this.statementToJS(stmt)).join('');
      js += `window.${funcName} = function(${params}) { ${body} };\n`;
    }

    // Top-level statements (if, for, etc.)
    if (this.ast.statements && this.ast.statements.length > 0) {
      for (const stmt of this.ast.statements) {
        js += this.statementToJS(stmt);
      }
    }
    
    // Gestion des handlers de touche globaux
    if (this.ast.keyHandlers && this.ast.keyHandlers.length > 0) {
        js += `
document.addEventListener('keydown', function(e) {
  const currentKey = e.key.toLowerCase();
`;
        for (const handler of this.ast.keyHandlers) {
            const keyJS = this.valueToJSString(handler.key);
            const actions = handler.actions.map(a => this.actionToJS(a, 'global')).join('');
            js += `
  if (currentKey === ${keyJS}.toLowerCase()) {
    e.preventDefault(); 
    ${actions}
  }
`;
        }
        js += `});\n`;
    }


    // Page switching
    js += `window.showPage = function(name) {
      document.querySelectorAll('[data-page]').forEach(p => p.classList.remove('active'));
      const p = document.querySelector('[data-page="' + name + '"]');
      if (p) p.classList.add('active');
    };`;

    return js;
  }

  // Génération du code JavaScript pour les statements (inclut le IF/ELSE au niveau global)
  statementToJS(stmt) {
    if (stmt.type === 'assignment') {
      // Pour les affectations de variables globales (pas les éléments)
      if (stmt.varName.includes('.')) {
          return `// Element property assignment in statement context ignored\n`;
      }
      return `window.psl_vars.${stmt.varName} = ${this.valueToJSString(stmt.value)};\n`;
    }
    if (stmt.type === 'functionCall') {
      const args = stmt.args.map(a => this.valueToJSString(a)).join(', ');
      
      if (stmt.name === 'log') {
        return `console.log(${args});\n`;
      }
      if (stmt.name === 'alert') {
        return `alert(${args});\n`;
      }
      
      return `window.${stmt.name}(${args});\n`;
    }
    // NOTE: Le traitement des IF statements globaux est différent du traitement IF dans les actions d'éléments
    if (stmt.type === 'if') {
      const cond = this.valueToJSString(stmt.condition); 
      // Si le IF vient d'un statement (fonction ou global), on utilise statementToJS.
      const body = stmt.body.map(s => this.statementToJS(s)).join('');
      let js = `if (${cond}) { ${body} }`;

      if (stmt.elseBody && stmt.elseBody.length > 0) {
          const elseBody = stmt.elseBody.map(s => this.statementToJS(s)).join('');
          js += ` else { ${elseBody} }`;
      }
      
      return js + '\n';
    }
    if (stmt.type === 'for') {
      const varName = stmt.varName;
      const coll = this.valueToJSString(stmt.collection);
      const body = stmt.body.map(s => this.statementToJS(s)).join('');
      return `for (let ${varName} of ${coll}) { ${body} }\n`;
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

  // Gère les expressions binaires
  valueToJSString(value) {
    if (!value) return 'null';
    if (value.type === 'string') return `"${value.value.replace(/"/g, '\\"')}"`;
    if (value.type === 'number') return value.value;
    if (value.type === 'boolean') return value.value ? 'true' : 'false';
    if (value.type === 'variable') return `window.psl_vars.${value.value}`;
    if (value.type === 'dotNotation') {
      return `window.psl_elements.${value.object}.${value.property}`;
    }

    if (value.type === 'binaryExpression') {
      const leftJS = this.valueToJSString(value.left);
      const rightJS = this.valueToJSString(value.right);
      
      const op = value.operator === '==' ? '===' : value.operator; 
      
      return `(${leftJS} ${op} ${rightJS})`;
    }

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
    console.log('Usage: node compiler.js <input.psl> [--output <output.html>]');
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