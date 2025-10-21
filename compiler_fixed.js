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

      // Opérateurs à deux caractères
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
      if (this.match('>=')) {
        this.tokens.push({ type: 'OPERATOR', value: '>=' });
        this.pos += 2;
        continue;
      }
      if (this.match('<=')) {
        this.tokens.push({ type: 'OPERATOR', value: '<=' });
        this.pos += 2;
        continue;
      }

      const char = this.input[this.pos];

      if (char === '#') {
        this.tokens.push({ type: 'HASH', value: '#' });
        this.pos++;
      } else if (char === '@') {
        this.tokens.push({ type: 'AT', value: '@' });
        this.pos++;
      } else if (/[a-zA-Z_]/.test(char)) {
        this.readIdentifier();
      } else if (/\d/.test(char)) {
        this.readNumber();
      } else if (char === '"' || char === "'") {
        this.readString();
      } else if ('{}()[];:,=.<>+-*/%?!'.includes(char)) {
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
    
    const unitStart = this.pos;
    let unit = '';
    while (this.pos < this.input.length && /[a-zA-Z%]/.test(this.input[this.pos])) {
      unit += this.input[this.pos];
      this.pos++;
    }
    
    const validUnits = ['px', 'vw', 'vh', '%', 'em', 'rem', 'vmin', 'vmax', 'cm', 'mm', 'in', 'pt', 'pc', 's', 'ms'];
    if (validUnits.includes(unit.toLowerCase()) || unit === '%') {
      value += unit;
    } else {
      this.pos = unitStart;
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
      keyHandlers: [],
      components: {},
      mediaQueries: {},
      watchers: [],
      intervals: [],
      imports: []
    };
    
    this.ast = ast; 

    while (!this.isAtEnd()) {
      this.skipWhitespace();
      
      if (this.peek().type === 'HASH') {
        this.pos++;
        const key = this.expect('IDENTIFIER').value;
        
        if (key === 'import') {
          this.expect('SYMBOL', ':');
          const importPath = this.parseExpression();
          ast.imports.push(importPath);
        } else {
          this.expect('SYMBOL', '=');
          const value = this.parseExpression();
          ast.metadata[key] = value;
        }
        
        if (this.peek().value === ';') this.pos++;
      } else if (this.peek().type === 'AT') {
        // Media queries
        this.pos++;
        const mediaType = this.expect('IDENTIFIER').value;
        this.expect('SYMBOL', '{');
        const rules = this.parseMediaQueryRules();
        this.expect('SYMBOL', '}');
        ast.mediaQueries[mediaType] = rules;
      } else if (this.peek().type === 'IDENTIFIER') {
        const name = this.peek().value;
        const lookAhead = this.peekAhead(1);
        
        if (name === 'onKey' && lookAhead.value === '(') {
          ast.keyHandlers.push(this.parseKeyHandler());
        } else if (name === 'component' && lookAhead.type === 'IDENTIFIER') {
          this.parseComponent();
        } else if (name === 'watch' && lookAhead.value === '(') {
          ast.watchers.push(this.parseWatcher());
        } else if (name === 'every' && lookAhead.value === '(') {
          ast.intervals.push(this.parseInterval());
        } else if (name === 'state' && lookAhead.type === 'IDENTIFIER') {
          this.parseState();
        } else if (lookAhead.value === '(') {
          if (this.peekAhead(2).value === '{' || this.isFunctionDeclaration()) {
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
  
  isFunctionDeclaration() {
    let offset = 2;
    let parenDepth = 1;
    
    while (parenDepth > 0 && this.pos + offset < this.tokens.length) {
      const token = this.tokens[this.pos + offset];
      if (token.value === '(') parenDepth++;
      if (token.value === ')') parenDepth--;
      offset++;
    }
    
    const nextToken = this.tokens[this.pos + offset];
    return nextToken && nextToken.value === '{';
  }
  
  parseMediaQueryRules() {
    const rules = {};
    
    while (this.peek().value !== '}' && !this.isAtEnd()) {
      this.skipWhitespace();
      if (this.peek().value === '}') break;
      
      const selector = this.expect('IDENTIFIER').value;
      this.expect('SYMBOL', ':');
      const value = this.parseExpression();
      rules[selector] = value;
      
      if (this.peek().value === ';') this.pos++;
    }
    
    return rules;
  }
  
  parseComponent() {
    this.expect('IDENTIFIER', 'component');
    const name = this.expect('IDENTIFIER').value;
    
    this.expect('SYMBOL', '(');
    const params = [];
    while (this.peek().value !== ')') {
      params.push(this.expect('IDENTIFIER').value);
      if (this.peek().value === ',') this.pos++;
    }
    this.expect('SYMBOL', ')');
    
    this.expect('SYMBOL', '{');
    const elements = [];
    
    while (this.peek().value !== '}' && !this.isAtEnd()) {
      this.skipWhitespace();
      if (this.peek().value === '}') break;
      const el = this.parseTopLevelElement();
      if (el) elements.push(el);
    }
    
    this.expect('SYMBOL', '}');
    
    this.ast.components[name] = { params, elements };
  }
  
  parseWatcher() {
    this.expect('IDENTIFIER', 'watch');
    this.expect('SYMBOL', '(');
    const variable = this.parseExpression();
    this.expect('SYMBOL', ')');
    this.expect('SYMBOL', '{');
    const actions = this.parseEventHandlerBody();
    this.expect('SYMBOL', '}');
    
    return { variable, actions };
  }
  
  parseInterval() {
    this.expect('IDENTIFIER', 'every');
    this.expect('SYMBOL', '(');
    const duration = this.parseExpression();
    this.expect('SYMBOL', ')');
    this.expect('SYMBOL', '{');
    const actions = this.parseEventHandlerBody();
    this.expect('SYMBOL', '}');
    
    return { duration, actions };
  }
  
  parseState() {
    this.expect('IDENTIFIER', 'state');
    const name = this.expect('IDENTIFIER').value;
    this.expect('SYMBOL', '=');
    const value = this.parseExpression();
    
    this.ast.globalVariables[name] = value;
    if (this.peek().value === ';') this.pos++;
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
    let padding = null;
    let bg = null;
    
    while (this.peek().value !== '}' && !this.isAtEnd()) {
      this.skipWhitespace();
      if (this.peek().value === '}') break;
      
      const token = this.peek();
      const nextToken = this.peekAhead(1);

      if (token.value === 'onKey' && nextToken.value === '(') {
          this.ast.keyHandlers.push(this.parseKeyHandler());
          continue; 
      }
      
      if (token.value === 'onSwipeLeft' || token.value === 'onSwipeRight' || 
          token.value === 'onSwipeUp' || token.value === 'onSwipeDown') {
        const swipeHandler = this.parseSwipeHandler();
        elements.push(swipeHandler);
        continue;
      }
      
      if (token.type === 'IDENTIFIER' && token.value === 'padding' && nextToken.value === ':') {
        this.expect('IDENTIFIER', 'padding');
        this.expect('SYMBOL', ':');
        padding = this.parseExpression();
        if (this.peek().value === ';') this.pos++;
        continue;
      }
      
      if (token.type === 'IDENTIFIER' && token.value === 'bg' && nextToken.value === ':') {
        this.expect('IDENTIFIER', 'bg');
        this.expect('SYMBOL', ':');
        bg = this.parseExpression();
        if (this.peek().value === ';') this.pos++;
        continue;
      }
      
      const el = this.parseTopLevelElement();
      if (el) elements.push(el);
    }
    
    this.expect('SYMBOL', '}');
    return { elements, padding, bg };
  }
  
  parseSwipeHandler() {
    const direction = this.expect('IDENTIFIER').value;
    this.expect('SYMBOL', '{');
    const actions = this.parseEventHandlerBody();
    this.expect('SYMBOL', '}');
    
    return {
      type: 'SwipeHandler',
      direction: direction.replace('onSwipe', '').toLowerCase(),
      actions
    };
  }

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
    
    if (elementName === 'for' && lookAhead.value === '(') {
      return this.parseForLoop();
    }
    
    this.pos++; 
    
    this.expect('SYMBOL', '(');
    
    let props = {};
    let directText = null;
    
    if (this.peek().type === 'STRING') {
      directText = this.parseExpression();
      if (elementName === 'image') {
        props.src = directText;
      } else if (elementName === 'input') {
        props.placeholder = directText;
      } else {
        props.text = directText;
      }
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
        
        if (token.type === 'IDENTIFIER' && nextToken.value === ':') {
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
        else if (token.type === 'IDENTIFIER' && ['onClick', 'onHover', 'onChange', 'onFocus', 'onBlur', 'onSubmit', 'onDragStart', 'onDragEnd', 'onDrop'].includes(token.value) && nextToken.value === '{') {
          const eventName = this.expect('IDENTIFIER').value;
          handlers.push(this.parseEventHandler(eventName));
        }
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
              this.pos++;
              this.expect('SYMBOL', '{');
              elseChildren = this.parseElementBlock();
              this.expect('SYMBOL', '}');
          }

          children.push({ type: 'if', condition, children: ifChildren, elseChildren });
        }
        else if (token.value === 'for' && nextToken.value === '(') {
          children.push(this.parseForLoop());
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
  
  parseForLoop() {
    this.expect('IDENTIFIER', 'for');
    this.expect('SYMBOL', '(');
    const varName = this.expect('IDENTIFIER').value;
    this.expect('IDENTIFIER', 'in');
    const collection = this.parseExpression();
    this.expect('SYMBOL', ')');
    this.expect('SYMBOL', '{');
    const elements = this.parseElementBlock();
    this.expect('SYMBOL', '}');
    
    return {
      type: 'ForLoop',
      varName,
      collection,
      elements
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

  parseEventHandlerBody() {
    const actions = [];
    
    while (this.peek().value !== '}' && !this.isAtEnd()) {
      this.skipWhitespace();
      if (this.peek().value === '}') break;
      
      const token = this.peek();
      const next = this.peekAhead(1);
      
      if (token.value === 'if' && next.value === '(') {
        actions.push(this.parseIfAction());
        continue; 
      }
      
      if (token.value === 'wait' && next.value === '(') {
        actions.push(this.parseWaitAction());
        continue;
      }
      
      if (token.value === 'else') {
        break;
      }
      
      if (token.type === 'IDENTIFIER') {
        const name = token.value;
        
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
        
        if (next.value === '.' && this.peekAhead(2).type === 'IDENTIFIER') {
          const elemName = this.expect('IDENTIFIER').value;
          this.expect('SYMBOL', '.');
          const propName = this.expect('IDENTIFIER').value;
          
          if (this.peek().value === ':') {
            this.pos++;
            const value = this.parseExpression();
            actions.push({ 
              type: 'assignment', 
              key: `${elemName}.${propName}`, 
              value 
            });
          }
          else if (this.peek().value === ';') {
            this.pos++;
            actions.push({ 
              type: 'assignment', 
              key: `${elemName}.${propName}`, 
              value: { type: 'boolean', value: true }
            });
          }
          else {
             actions.push({ 
              type: 'assignment', 
              key: `${elemName}.${propName}`, 
              value: { type: 'boolean', value: true }
            });
          }
          continue;
        }
        else if (next.value === ':') {
          const key = this.expect('IDENTIFIER').value;
          this.expect('SYMBOL', ':');
          const value = this.parseExpression();
          actions.push({ type: 'assignment', key, value });
          if (this.peek().value === ';') this.pos++;
          continue;
        }
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
  
  parseWaitAction() {
    this.expect('IDENTIFIER', 'wait');
    this.expect('SYMBOL', '(');
    const duration = this.parseExpression();
    this.expect('SYMBOL', ')');
    
    let body = [];
    if (this.peek().value === '{') {
      this.expect('SYMBOL', '{');
      body = this.parseEventHandlerBody();
      this.expect('SYMBOL', '}');
    } else {
      if (this.peek().value === ';') this.pos++;
    }
    
    return { type: 'wait', duration, body };
  }

  parseEventHandler(eventName) {
    this.expect('SYMBOL', '{');
    const actions = this.parseEventHandlerBody();
    this.expect('SYMBOL', '}');
    return { event: eventName, actions };
  }

  parseBlock() {
    const statements = [];
    
    while (this.peek().value !== '}' && !this.isAtEnd()) {
      this.skipWhitespace();
      if (this.peek().value === '}') break;
      
      if (this.peek().value === 'if') {
        statements.push(this.parseIfStatement());
      } 
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
      else if (this.peek().type === 'IDENTIFIER' && this.peekAhead(1).value === '=') {
        const varName = this.expect('IDENTIFIER').value;
        this.expect('SYMBOL', '=');
        const value = this.parseExpression();
        statements.push({ type: 'assignment', varName, value });
        if (this.peek().value === ';') this.pos++;
      } 
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

  parseIfAction() {
    this.expect('IDENTIFIER', 'if'); 
    this.expect('SYMBOL', '(');
    const condition = this.parseExpression();
    this.expect('SYMBOL', ')');
    this.expect('SYMBOL', '{');
    const body = this.parseEventHandlerBody(); 
    this.expect('SYMBOL', '}');

    let elseBody = null;
    this.skipWhitespace();
    if (this.peek().value === 'else') {
        this.pos++;
        this.skipWhitespace();
        this.expect('SYMBOL', '{');
        elseBody = this.parseEventHandlerBody(); 
        this.expect('SYMBOL', '}');
    }
    
    return { type: 'if', condition, body, elseBody };
  }

  parseIfStatement() {
    this.expect('IDENTIFIER', 'if'); 
    this.expect('SYMBOL', '(');
    const condition = this.parseExpression();
    this.expect('SYMBOL', ')');
    this.expect('SYMBOL', '{');
    const body = this.parseBlock(); 
    this.expect('SYMBOL', '}');

    let elseBody = null;
    if (this.peek().value === 'else') {
        this.pos++;
        this.expect('SYMBOL', '{');
        elseBody = this.parseBlock(); 
        this.expect('SYMBOL', '}');
    }
    
    return { type: 'if', condition, body, elseBody };
  }

  parseExpression() {
    return this.parseTernary();
  }
  
  parseTernary() {
    let expr = this.parseLogical();
    
    if (this.peek().value === '?') {
      this.pos++;
      const trueExpr = this.parseExpression();
      this.expect('SYMBOL', ':');
      const falseExpr = this.parseExpression();
      
      return {
        type: 'ternary',
        condition: expr,
        trueExpr,
        falseExpr
      };
    }
    
    return expr;
  }
  
  parseLogical() {
    let left = this.parseComparison();
    
    while (this.peek().type === 'OPERATOR' && ['==', '!='].includes(this.peek().value)) {
      const operator = this.peek().value;
      this.pos++;
      const right = this.parseComparison();
      
      left = {
        type: 'binaryExpression',
        operator,
        left,
        right
      };
    }
    
    return left;
  }
  
  parseComparison() {
    let left = this.parseAdditive();
    
    while (this.peek().value && ['<', '>', '<=', '>='].includes(this.peek().value)) {
      const operator = this.peek().value;
      this.pos++;
      const right = this.parseAdditive();
      
      left = {
        type: 'binaryExpression',
        operator,
        left,
        right
      };
    }
    
    return left;
  }
  
  parseAdditive() {
    let left = this.parseMultiplicative();
    
    while (this.peek().value && ['+', '-'].includes(this.peek().value)) {
      const operator = this.peek().value;
      this.pos++;
      const right = this.parseMultiplicative();
      
      left = {
        type: 'binaryExpression',
        operator,
        left,
        right
      };
    }
    
    return left;
  }
  
  parseMultiplicative() {
    let left = this.parsePrimary();
    
    while (this.peek().value && ['*', '/', '%'].includes(this.peek().value)) {
      const operator = this.peek().value;
      this.pos++;
      const right = this.parsePrimary();
      
      left = {
        type: 'binaryExpression',
        operator,
        left,
        right
      };
    }
    
    return left;
  }

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
    if (token.value === '[') {
      return this.parseArray();
    }
    if (token.value === '{' && this.peekAhead(1).type === 'IDENTIFIER') {
      return this.parseObject();
    }
    if (token.type === 'IDENTIFIER') {
      const value = token.value;
      if (value === 'true' || value === 'false') {
        this.pos++;
        return { type: 'boolean', value: value === 'true' };
      }
      
      this.pos++;
      
      if (this.peek().value === '.') {
        this.pos++;
        const property = this.expect('IDENTIFIER').value;
        return { type: 'dotNotation', object: value, property };
      }
      
      if (value.startsWith('#') || this.isColorName(value) || this.isPositionKeyword(value)) {
        return { type: 'string', value };
      }
      
      return { type: 'variable', value };
    }
    
    return { type: 'null', value: null };
  }
  
  parseArray() {
    this.expect('SYMBOL', '[');
    const elements = [];
    
    while (this.peek().value !== ']' && !this.isAtEnd()) {
      elements.push(this.parseExpression());
      if (this.peek().value === ',') this.pos++;
    }
    
    this.expect('SYMBOL', ']');
    return { type: 'array', elements };
  }
  
  parseObject() {
    this.expect('SYMBOL', '{');
    const properties = {};
    
    while (this.peek().value !== '}' && !this.isAtEnd()) {
      const key = this.expect('IDENTIFIER').value;
      this.expect('SYMBOL', ':');
      const value = this.parseExpression();
      properties[key] = value;
      
      if (this.peek().value === ',') this.pos++;
    }
    
    this.expect('SYMBOL', '}');
    return { type: 'object', properties };
  }

  isColorName(value) {
    const colorNames = [
      'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'brown',
      'black', 'white', 'gray', 'grey', 'cyan', 'magenta', 'lime', 'navy',
      'teal', 'aqua', 'maroon', 'olive', 'silver', 'gold', 'violet', 'indigo',
      'coral', 'salmon', 'khaki', 'crimson', 'azure', 'beige', 'tan', 'ivory',
      'turquoise', 'plum', 'orchid', 'lavender', 'mint', 'peach', 'chocolate',
      'tomato', 'wheat', 'snow', 'seashell', 'linen', 'honeydew', 'aliceblue',
      'lightblue', 'darkblue', 'lightgreen', 'darkgreen', 'lightgray', 'darkgray',
      'lightgrey', 'darkgrey', 'lightyellow', 'darkyellow', 'lightpink', 'darkpink'
    ];
    return colorNames.includes(value.toLowerCase());
  }

  isPositionKeyword(value) {
    const positionKeywords = ['top', 'bottom', 'left', 'right', 'center'];
    return positionKeywords.includes(value.toLowerCase());
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
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <meta name="theme-color" content="#2196F3">
    <title>${this.getMetadata('name') || 'App'}</title>
    <script>
        window.psl_vars = {};
        window.psl_elements = {};
        window.psl_watchers = [];
        window.psl_intervals = [];
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
        // Prevent pinch zoom
        document.addEventListener('gesturestart', function(e) {
            e.preventDefault();
        });
        document.addEventListener('gesturechange', function(e) {
            e.preventDefault();
        });
        document.addEventListener('gestureend', function(e) {
            e.preventDefault();
        });
        // Prevent double-tap zoom
        let lastTouchEnd = 0;
        document.addEventListener('touchend', function(e) {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) {
                e.preventDefault();
            }
            lastTouchEnd = now;
        }, false);
        // Prevent image dragging
        document.addEventListener('DOMContentLoaded', function() {
            document.querySelectorAll('img').forEach(function(img) {
                img.setAttribute('draggable', 'false');
                img.addEventListener('dragstart', function(e) {
                    e.preventDefault();
                    return false;
                });
                img.addEventListener('mousedown', function(e) {
                    e.preventDefault();
                });
            });
        });
        // Prevent dragging for dynamically added images
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                mutation.addedNodes.forEach(function(node) {
                    if (node.tagName === 'IMG') {
                        node.setAttribute('draggable', 'false');
                        node.addEventListener('dragstart', function(e) {
                            e.preventDefault();
                            return false;
                        });
                        node.addEventListener('mousedown', function(e) {
                            e.preventDefault();
                        });
                    }
                    if (node.querySelectorAll) {
                        node.querySelectorAll('img').forEach(function(img) {
                            img.setAttribute('draggable', 'false');
                            img.addEventListener('dragstart', function(e) {
                                e.preventDefault();
                                return false;
                            });
                            img.addEventListener('mousedown', function(e) {
                                e.preventDefault();
                            });
                        });
                    }
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
        
        // Swipe detection
        window.setupSwipeDetection = function() {
            let touchStartX = 0;
            let touchStartY = 0;
            let touchEndX = 0;
            let touchEndY = 0;
            const minSwipeDistance = 50;
            
            document.addEventListener('touchstart', function(e) {
                touchStartX = e.changedTouches[0].screenX;
                touchStartY = e.changedTouches[0].screenY;
            }, false);
            
            document.addEventListener('touchend', function(e) {
                touchEndX = e.changedTouches[0].screenX;
                touchEndY = e.changedTouches[0].screenY;
                handleSwipe();
            }, false);
            
            function handleSwipe() {
                const deltaX = touchEndX - touchStartX;
                const deltaY = touchEndY - touchStartY;
                
                if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minSwipeDistance) {
                    if (deltaX > 0) {
                        window.dispatchEvent(new CustomEvent('psl-swipe-right'));
                    } else {
                        window.dispatchEvent(new CustomEvent('psl-swipe-left'));
                    }
                } else if (Math.abs(deltaY) > minSwipeDistance) {
                    if (deltaY > 0) {
                        window.dispatchEvent(new CustomEvent('psl-swipe-down'));
                    } else {
                        window.dispatchEvent(new CustomEvent('psl-swipe-up'));
                    }
                }
            }
        };
        window.setupSwipeDetection();
        
        // Notification support
        window.notify = function(message, duration = 3000) {
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(message);
            } else if ('Notification' in window && Notification.permission !== 'denied') {
                Notification.requestPermission().then(function(permission) {
                    if (permission === 'granted') {
                        new Notification(message);
                    } else {
                        showToast(message, duration);
                    }
                });
            } else {
                showToast(message, duration);
            }
        };
        
        function showToast(message, duration) {
            const toast = document.createElement('div');
            toast.textContent = message;
            toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#333;color:white;padding:12px 24px;border-radius:4px;z-index:10000;';
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), duration);
        }
        
        // LocalStorage helpers
        window.save = function(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch(e) {
                console.error('LocalStorage save error:', e);
            }
        };
        
        window.load = function(key, defaultValue = null) {
            try {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : defaultValue;
            } catch(e) {
                console.error('LocalStorage load error:', e);
                return defaultValue;
            }
        };
        
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
    const cacheName = 'psl-cache-v1';
    return `
const CACHE_NAME = '${cacheName}';
const urlsToCache = ['/'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(response => {
      return response || fetch(e.request).then(fetchResponse => {
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(e.request, fetchResponse.clone());
          return fetchResponse;
        });
      });
    }).catch(() => new Response('Offline'))
  );
});`;
  }

  generateCSS() {
    let css = `
      body { background: #f5f5f5; font-family: Arial, sans-serif; margin: 0; padding: 0; }
      [data-page] { padding: 20px; display: flex; flex-direction: column; position: relative; min-height: 100vh; }
      button { padding: 10px 15px; cursor: pointer; background: #2196F3; color: white; border: none; border-radius: 4px; }
      button:hover { background: #1976D2; }
      input { padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
      h1, h2, h3, p { margin: 10px 0; }
      div, h1, h2, h3, p, button, input { box-sizing: border-box; }
      img { height: 50px; user-select: none; -webkit-user-drag: none; -webkit-user-select: none; pointer-events: auto; }
      * { user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; }
      input, textarea { user-select: text; -webkit-user-select: text; -moz-user-select: text; -ms-user-select: text; }
      
      /* Animations */
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
      @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      @keyframes slideDown { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      @keyframes slideLeft { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      @keyframes slideRight { from { transform: translateX(-20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
      @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    `;
    
    // Media queries
    for (const [mediaType, rules] of Object.entries(this.ast.mediaQueries)) {
      const mediaQuery = this.getMediaQuery(mediaType);
      css += `\n${mediaQuery} {\n`;
      
      for (const [selector, value] of Object.entries(rules)) {
        const cssValue = this.valueToString(value);
        css += `  ${selector} { ${this.propertyToCSS(selector, cssValue)} }\n`;
      }
      
      css += `}\n`;
    }
    
    return css;
  }
  
  getMediaQuery(type) {
    const queries = {
      mobile: '@media (max-width: 768px)',
      tablet: '@media (min-width: 769px) and (max-width: 1024px)',
      desktop: '@media (min-width: 1025px)',
      portrait: '@media (orientation: portrait)',
      landscape: '@media (orientation: landscape)'
    };
    return queries[type] || `@media (max-width: 768px)`;
  }
  
  propertyToCSS(property, value) {
    const mapping = {
      size: `font-size: ${value}`,
      bg: `background-color: ${value}`,
      color: `color: ${value}`
    };
    return mapping[property] || `${property}: ${value}`;
  }

  generatePages() {
    let html = '';
    const pageNames = Object.keys(this.ast.pages);
    
    for (const pageName of pageNames) {
      const page = this.ast.pages[pageName];
      
      let pagePadding = '20px';
      if (page.padding) {
        pagePadding = this.getStyleValue('padding', this.valueToString(page.padding));
      }
      
      let pageBg = '';
      if (page.bg) {
        const bgValue = this.valueToString(page.bg);
        pageBg = `background-color: ${bgValue};`;
      }
      
      html += `<div data-page="${pageName}" data-padding="${pagePadding}" class="page ${pageName === pageNames[0] ? 'active' : ''}" style="padding: ${pagePadding}; ${pageBg}">`;
      html += page.elements.map((el) => {
        if (el.type === 'SwipeHandler') {
          return this.generateSwipeHandler(el);
        }
        return this.generateElement(el, pageName, pagePadding);
      }).join('\n');
      html += `</div>`;
    }
    return html;
  }
  
  generateSwipeHandler(handler) {
    const actions = handler.actions.map(a => this.actionToJS(a, 'global')).join('');
    return `<script>
      window.addEventListener('psl-swipe-${handler.direction}', function() {
        ${actions}
      });
    </script>`;
  }

  getStyleValue(key, strValue) {
      if (['width', 'height', 'size', 'border-size', 'padding', 'margin', 'gap', 'radius'].includes(key)) {
          const trimmed = String(strValue).trim();
          
          if (/\d+\.?\d*(px|vw|vh|%|em|rem|vmin|vmax|cm|mm|in|pt|pc)\s*$/i.test(trimmed) || trimmed.includes('%')) {
              return trimmed;
          }
          
          const numValue = parseFloat(trimmed);
          if (!isNaN(numValue) && /^\d+\.?\d*$/.test(trimmed)) {
              return `${trimmed}px`;
          }
          
          return trimmed;
      }
      return strValue;
  }

  generateElement(el, pageName, pagePadding = '20px') {
    if (el.type === 'ForLoop') {
      return this.generateForLoop(el, pageName, pagePadding);
    }
    
    const tag = this.getElementTag(el.name);
    const id = `el_${this.elementId++}`;
    
    const paddingParts = pagePadding.split(' ');
    let topPadding, rightPadding, bottomPadding, leftPadding;
    
    if (paddingParts.length === 1) {
      topPadding = rightPadding = bottomPadding = leftPadding = paddingParts[0];
    } else if (paddingParts.length === 2) {
      topPadding = bottomPadding = paddingParts[0];
      leftPadding = rightPadding = paddingParts[1];
    } else if (paddingParts.length === 3) {
      topPadding = paddingParts[0];
      leftPadding = rightPadding = paddingParts[1];
      bottomPadding = paddingParts[2];
    } else if (paddingParts.length === 4) {
      topPadding = paddingParts[0];
      rightPadding = paddingParts[1];
      bottomPadding = paddingParts[2];
      leftPadding = paddingParts[3];
    }
    
    let hasBasePositioning = false;
    let basePosition = null;
    let horizontalAlign = null;
    let needsWrapper = false;
    let wrapperStyles = [];
    let justifyContent = null;
    let alignItems = null;
    let isFixed = false;
    
    for (const [key, value] of Object.entries(el.props)) {
      const strValue = this.valueToString(value);
      
      if (key === 'base') {
        hasBasePositioning = true;
        basePosition = strValue;
      } else if (key === 'fixed') {
        isFixed = (strValue === 'true' || strValue === '1' || !value.value);
      } else if (key === 'center') {
        if (strValue === 'true' || strValue === '1' || !value.value) {
          horizontalAlign = 'center';
          if (!hasBasePositioning) {
            needsWrapper = true;
            justifyContent = 'center';
            alignItems = 'center';
          }
        }
      } else if (key === 'left') {
        horizontalAlign = 'left';
        if (!hasBasePositioning) {
          needsWrapper = true;
          justifyContent = 'flex-start';
        }
      } else if (key === 'right') {
        horizontalAlign = 'right';
        if (!hasBasePositioning) {
          needsWrapper = true;
          justifyContent = 'flex-end';
        }
      }
    }

    let wrapperOpen = '';
    let wrapperClose = '';
    
    if (needsWrapper && !hasBasePositioning) {
      wrapperStyles.push(`display: flex`);
      if (justifyContent) wrapperStyles.push(`justify-content: ${justifyContent}`);
      if (alignItems) wrapperStyles.push(`align-items: ${alignItems}`);
      
      wrapperOpen = `<div style="${wrapperStyles.join('; ')}">`;
      wrapperClose = `</div>`;
    }

    let html = `${wrapperOpen}<${tag} id="${id}"`;

    let styles = [];
    let elementVarName = null;
    let dragData = null;

    for (const [key, value] of Object.entries(el.props)) {
      const strValue = this.valueToString(value);
      
      if (key === 'text') {
        // Will be added after opening tag
      } else if (key === 'src') {
        html += ` src="${strValue}"`;
        if (el.props.lazy) {
          html += ` loading="lazy"`;
        }
      } else if (key === 'placeholder') {
        html += ` placeholder="${strValue}"`;
      } else if (key === 'var') {
        elementVarName = strValue;
      } else if (key === 'draggable') {
        if (strValue === 'true' || strValue === '1') {
          html += ` draggable="true"`;
          dragData = 'drag';
        }
      } else if (key === 'lazy') {
        // Already handled in src
      } else if (key === 'animate') {
        const animValue = strValue.split(' ');
        const animName = animValue[0];
        const animDuration = animValue[1] || '1s';
        styles.push(`animation: ${animName} ${animDuration}`);
      } else if (key === 'layout') {
        if (strValue === 'flex') {
          styles.push(`display: flex`);
        } else if (strValue === 'grid') {
          styles.push(`display: grid`);
        }
      } else if (key === 'direction') {
        if (strValue === 'row') {
          styles.push(`flex-direction: row`);
        } else if (strValue === 'column') {
          styles.push(`flex-direction: column`);
        }
      } else if (key === 'wrap') {
        if (strValue === 'true' || strValue === '1') {
          styles.push(`flex-wrap: wrap`);
        }
      } else if (key === 'align') {
        if (strValue === 'center') {
          styles.push(`align-items: center`);
        } else if (strValue === 'start') {
          styles.push(`align-items: flex-start`);
        } else if (strValue === 'end') {
          styles.push(`align-items: flex-end`);
        }
      } else if (key === 'justify') {
        if (strValue === 'center') {
          styles.push(`justify-content: center`);
        } else if (strValue === 'start') {
          styles.push(`justify-content: flex-start`);
        } else if (strValue === 'end') {
          styles.push(`justify-content: flex-end`);
        } else if (strValue === 'between') {
          styles.push(`justify-content: space-between`);
        } else if (strValue === 'around') {
          styles.push(`justify-content: space-around`);
        }
      } else if (key === 'shadow') {
        styles.push(`box-shadow: ${strValue}`);
      } else if (key === 'blur') {
        styles.push(`filter: blur(${this.getStyleValue('blur', strValue)})`);
      } else if (key === 'opacity') {
        styles.push(`opacity: ${strValue}`);
      } else if (key === 'base') {
        const positionType = isFixed ? 'fixed' : 'absolute';
        styles.push(`position: ${positionType}`);
        
        if (strValue === 'bottom') {
          styles.push(`bottom: ${bottomPadding}`);
          if (!horizontalAlign) {
            styles.push(`left: ${leftPadding}`);
            styles.push(`right: ${rightPadding}`);
          }
        } else if (strValue === 'top') {
          styles.push(`top: ${topPadding}`);
          if (!horizontalAlign) {
            styles.push(`left: ${leftPadding}`);
            styles.push(`right: ${rightPadding}`);
          }
        } else if (strValue === 'left') {
          styles.push(`left: ${leftPadding}`);
          styles.push(`top: ${topPadding}`);
          styles.push(`bottom: ${bottomPadding}`);
        } else if (strValue === 'right') {
          styles.push(`right: ${rightPadding}`);
          styles.push(`top: ${topPadding}`);
          styles.push(`bottom: ${bottomPadding}`);
        }
        
        if (horizontalAlign === 'center') {
          styles.push(`left: 50%`);
          styles.push(`transform: translateX(-50%)`);
        } else if (horizontalAlign === 'left') {
          styles.push(`left: ${leftPadding}`);
        } else if (horizontalAlign === 'right') {
          styles.push(`right: ${rightPadding}`);
        }
      } else if (key === 'fixed') {
        // Already handled
      } else if (key === 'center' || key === 'left' || key === 'right') {
        // Already handled
      } else if (key === 'top' || key === 'bottom') {
        // Skip
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
        if (strValue.includes('gradient')) {
          styles.push(`background: ${strValue}`);
        } else {
          styles.push(`background-color: ${strValue}`);
        }
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

    if (styles.length > 0) {
      html += ` style="${styles.join('; ')}"`;
    }

    html += `>`;

    if (el.props && el.props.text && tag !== 'img') {
      const textValue = this.valueToString(el.props.text);
      html += this.interpolateTemplateString(textValue);
    }

    if (el.children && el.children.length > 0) {
      for (const child of el.children) {
        if (child.type === 'if') {
          const condJS = this.valueToJSString(child.condition);
          const ifBlockId = `if_block_${this.elementId++}`;
          const elseBlockId = child.elseChildren && child.elseChildren.length > 0 ? `else_block_${this.elementId++}` : null;

          const ifChildrenHTML = child.children.map(c => this.generateElement(c, pageName, pagePadding)).join('');
          html += `<div id="${ifBlockId}" class="psl-if-block" style="display: none; margin: 0;">\n${ifChildrenHTML}\n</div>`;

          if (elseBlockId) {
              const elseChildrenHTML = child.elseChildren.map(c => this.generateElement(c, pageName, pagePadding)).join('');
              html += `<div id="${elseBlockId}" class="psl-else-block" style="display: none; margin: 0;">\n${elseChildrenHTML}\n</div>`;
          }
          
          let scriptContent = `
            (function() {
              const ifEl = document.getElementById('${ifBlockId}');
              ${elseBlockId ? `const elseEl = document.getElementById('${elseBlockId}');` : ''}
              
              function updateConditionalDisplay() {
                  if (${condJS}) {
                      if (ifEl) ifEl.style.display = 'block';
                      ${elseBlockId ? `if (elseEl) elseEl.style.display = 'none';` : ''}
                  } else {
                      if (ifEl) ifEl.style.display = 'none';
                      ${elseBlockId ? `if (elseEl) elseEl.style.display = 'block';` : ''}
                  }
              }
              updateConditionalDisplay();
            })();
          `;

          html += `<script>${scriptContent}</script>`;

        } else if (child.type === 'ForLoop') {
          html += this.generateForLoop(child, pageName, pagePadding);
        } else {
          html += this.generateElement(child, pageName, pagePadding);
        }
      }
    }

    html += `</${tag}>${wrapperClose}`;

    let handlerCode = '';
    
    if (el.handlers.length > 0 || elementVarName || dragData) {
      handlerCode = `
        (function() {
          const el = document.getElementById('${id}');
          if (!el) return;
          ${elementVarName ? `window.psl_elements.${elementVarName} = el;` : ''}
          
          ${dragData ? `
          el.addEventListener('dragstart', function(e) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', this.innerHTML);
          });
          ` : ''}
          
          ${el.handlers.map(h => {
            const eventName = h.event.replace('on', '').toLowerCase();
            const actions = h.actions.map(a => this.actionToJS(a, id)).join('');
            const isAsync = actions.includes('await');
            
            if (eventName === 'drop') {
              return `
              el.addEventListener('dragover', function(e) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              });
              el.addEventListener('${eventName}', ${isAsync ? 'async' : ''} function(e) {
                e.preventDefault();
                ${actions}
              });`;
            }
            
            if (isAsync) {
              return `el.addEventListener('${eventName}', async function() { ${actions} });`;
            } else {
              return `el.addEventListener('${eventName}', function() { ${actions} });`;
            }
          }).join('\n')}
        })();
      `;
      html += `<script>${handlerCode}</script>`;
    }

    return html;
  }
  
  generateForLoop(forLoop, pageName, pagePadding) {
    const containerId = `for_loop_${this.elementId++}`;
    const collectionJS = this.valueToJSString(forLoop.collection);
    const varName = forLoop.varName;
    
    // Store elements as a global temporary variable
    const tempVarName = `psl_loop_template_${containerId}`;
    
    // Pre-render the template with placeholder
    const templateHTML = forLoop.elements.map(el => {
      // Temporarily replace variable references
      const modifiedEl = this.replaceLoopVariable(el, varName, '__LOOP_VAR__');
      return this.generateElement(modifiedEl, pageName, pagePadding);
    }).join('');
    
    // Escape the HTML for safe embedding in JS
const escapedHTML = templateHTML
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$');
  
  interpolateTemplateString(text) {
    return text.replace(/\{([^}]+)\}/g, (match, varName) => {
      return `<span class="psl-var" data-var="${varName.trim()}"></span>`;
    });
  }

  actionToJS(action, elementId) {
    if (action.type === 'assignment') {
      const key = action.key;
      const value = this.valueToJSString(action.value);
      
      if (key.includes('.')) {
        const [elemName, prop] = key.split('.');
        
        const isPage = this.ast.pages && this.ast.pages[elemName];
        
        if (isPage) {
          if (prop === 'hide') {
            return `
              const pageEl = document.querySelector('[data-page="${elemName}"]');
              if (pageEl) {
                pageEl.classList.remove('active');
                pageEl.style.display = 'none';
              }
            `;
          } else if (prop === 'show') {
            return `
              document.querySelectorAll('[data-page]').forEach(p => p.classList.remove('active'));
              const pageEl = document.querySelector('[data-page="${elemName}"]');
              if (pageEl) {
                pageEl.classList.add('active');
                pageEl.style.display = 'block';
              }
            `;
          }
        }
        
        return `
          if (window.psl_elements && window.psl_elements['${elemName}']) {
            const el = window.psl_elements['${elemName}'];
            const propValue = ${value};
            if ('${prop}' === 'text') {
              el.textContent = propValue;
            } else if ('${prop}' === 'value') {
              el.value = propValue;
            } else if ('${prop}' === 'src') {
              el.src = propValue;
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
            } else if ('${prop}' === 'width') {
              el.style.width = propValue + 'px';
            } else if ('${prop}' === 'height') {
              el.style.height = propValue + 'px';
            } else {
              el.setAttribute('data-' + '${prop}', propValue);
            }
            window.psl_triggerWatchers('${elemName}');
          }
        `;
      } else {
        return `
          window.psl_vars.${key} = ${value};
          window.psl_triggerWatchers('${key}');
        `;
      }
    } 
    else if (action.type === 'functionCall') {
        const args = action.args.map(a => this.valueToJSString(a)).join(', ');
        
        if (action.name === 'log') {
          return `console.log(${args});\n`;
        }
        if (action.name === 'alert') {
          return `alert(${args});\n`;
        }
        if (action.name === 'notify') {
          return `notify(${args});\n`;
        }
        if (action.name === 'save') {
          return `save(${args});\n`;
        }
        if (action.name === 'load') {
          return `load(${args});\n`;
        }
        
        return `window.${action.name}(${args});\n`;
    }
    else if (action.type === 'if') {
        const cond = this.valueToJSString(action.condition); 
        const ifBody = action.body.map(s => this.actionToJS(s, elementId)).join('');
        let js = `if (${cond}) { ${ifBody} }`;

        if (action.elseBody && action.elseBody.length > 0) {
            const elseBody = action.elseBody.map(s => this.actionToJS(s, elementId)).join('');
            js += ` else { ${elseBody} }`;
        }
        
        return js + '\n';
    }
    else if (action.type === 'wait') {
        const duration = this.valueToJSString(action.duration);
        const body = action.body.map(s => this.actionToJS(s, elementId)).join('');
        return `await new Promise(resolve => setTimeout(resolve, ${duration})); ${body}`;
    }

    return '';
  }

  generateJavaScript() {
    let js = `// Global variables and reactive system\n`;
    
    // Initialize variables
    for (const [name, value] of Object.entries(this.ast.globalVariables)) {
      js += `window.psl_vars.${name} = ${this.valueToJSString(value)};\n`;
    }
    
    // Watchers system
    js += `
window.psl_triggerWatchers = function(varName) {
  window.psl_watchers.forEach(function(watcher) {
    if (watcher.variable === varName) {
      watcher.callback();
    }
  });
  
  // Update template strings
  document.querySelectorAll('.psl-var').forEach(function(el) {
    const varName = el.getAttribute('data-var');
    if (window.psl_vars[varName] !== undefined) {
      el.textContent = window.psl_vars[varName];
    }
  });
};
`;

    // Setup watchers
    for (const watcher of this.ast.watchers) {
      const varName = this.valueToString(watcher.variable);
      const actions = watcher.actions.map(a => this.actionToJS(a, 'global')).join('');
      js += `
window.psl_watchers.push({
  variable: '${varName}',
  callback: function() {
    ${actions}
  }
});
`;
    }

    // Setup intervals
    for (const interval of this.ast.intervals) {
      const duration = this.valueToJSString(interval.duration);
      const actions = interval.actions.map(a => this.actionToJS(a, 'global')).join('');
      js += `
window.psl_intervals.push(setInterval(function() {
  ${actions}
}, ${duration}));
`;
    }

    // Functions
    for (const [funcName, func] of Object.entries(this.ast.functions)) {
      const params = func.params.join(', ');
      const body = func.body.map(stmt => this.statementToJS(stmt)).join('');
      js += `window.${funcName} = function(${params}) { ${body} };\n`;
    }

    // Global statements
    if (this.ast.statements && this.ast.statements.length > 0) {
      for (const stmt of this.ast.statements) {
        js += this.statementToJS(stmt);
      }
    }
    
    // Key handlers
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
    
    // Helper for rendering elements in for loops
    js += `
window.psl_renderElement = function(el, pageName, pagePadding, loopVar) {
  // This is a placeholder - in a real implementation, this would recreate the element
  return '<div>Loop item</div>';
};
`;

    js += `window.showPage = function(name) {
      document.querySelectorAll('[data-page]').forEach(p => p.classList.remove('active'));
      const p = document.querySelector('[data-page="' + name + '"]');
      if (p) p.classList.add('active');
    };`;
    
    // Initialize template strings
    js += `
setTimeout(function() {
  document.querySelectorAll('.psl-var').forEach(function(el) {
    const varName = el.getAttribute('data-var');
    if (window.psl_vars[varName] !== undefined) {
      el.textContent = window.psl_vars[varName];
    }
  });
}, 0);
`;

    return js;
  }

  statementToJS(stmt) {
    if (stmt.type === 'assignment') {
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
    if (stmt.type === 'if') {
      const cond = this.valueToJSString(stmt.condition); 
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
    if (value.type === 'array') {
      return '[' + value.elements.map(e => this.valueToString(e)).join(', ') + ']';
    }
    if (value.type === 'object') {
      const pairs = Object.entries(value.properties).map(([k, v]) => `${k}: ${this.valueToString(v)}`);
      return '{' + pairs.join(', ') + '}';
    }
    return '';
  }

  valueToJSString(value) {
    if (!value) return 'null';
    if (value.type === 'string') return `"${value.value.replace(/"/g, '\\"')}"`;
    if (value.type === 'number') return value.value;
    if (value.type === 'boolean') return value.value ? 'true' : 'false';
    if (value.type === 'variable') return `window.psl_vars.${value.value}`;
    if (value.type === 'array') {
      const elements = value.elements.map(e => this.valueToJSString(e)).join(', ');
      return `[${elements}]`;
    }
    if (value.type === 'object') {
      const pairs = Object.entries(value.properties).map(([k, v]) => `${k}: ${this.valueToJSString(v)}`);
      return `{${pairs.join(', ')}}`;
    }
    if (value.type === 'dotNotation') {
      const prop = value.property;
      if (prop === 'text') {
        return `(window.psl_elements.${value.object} ? window.psl_elements.${value.object}.textContent : '')`;
      } else if (prop === 'value') {
        return `(window.psl_elements.${value.object} ? window.psl_elements.${value.object}.value : '')`;
      } else if (prop === 'src') {
        return `(window.psl_elements.${value.object} ? window.psl_elements.${value.object}.src : '')`;
      } else if (prop === 'bg') {
        return `(window.psl_elements.${value.object} ? window.psl_elements.${value.object}.style.backgroundColor : '')`;
      } else if (prop === 'color') {
        return `(window.psl_elements.${value.object} ? window.psl_elements.${value.object}.style.color : '')`;
      } else if (prop === 'size') {
        return `(window.psl_elements.${value.object} ? parseInt(window.psl_elements.${value.object}.style.fontSize) : 0)`;
      } else if (prop === 'width') {
        return `(window.psl_elements.${value.object} ? parseInt(window.psl_elements.${value.object}.style.width) : 0)`;
      } else if (prop === 'height') {
        return `(window.psl_elements.${value.object} ? parseInt(window.psl_elements.${value.object}.style.height) : 0)`;
      } else {
        return `(window.psl_elements.${value.object} ? window.psl_elements.${value.object}.getAttribute('data-${prop}') : '')`;
      }
    }
    if (value.type === 'binaryExpression') {
      const leftJS = this.valueToJSString(value.left);
      const rightJS = this.valueToJSString(value.right);
      const op = value.operator === '==' ? '===' : value.operator;
      return `(${leftJS} ${op} ${rightJS})`;
    }
    if (value.type === 'ternary') {
      const condJS = this.valueToJSString(value.condition);
      const trueJS = this.valueToJSString(value.trueExpr);
      const falseJS = this.valueToJSString(value.falseExpr);
      return `(${condJS} ? ${trueJS} : ${falseJS})`;
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

main(););
    
    return `
      <div id="${containerId}" class="psl-for-loop"></div>
      <script>
        (function() {
          const container = document.getElementById('${containerId}');
          const collection = ${collectionJS};
          const templateHTML = \`${escapedHTML}\`;
          
          if (Array.isArray(collection)) {
            collection.forEach(function(loopItem) {
              let html = templateHTML.replace(/__LOOP_VAR__/g, loopItem);
              container.insertAdjacentHTML('beforeend', html);
            });
          } else if (typeof collection === 'object') {
            Object.values(collection).forEach(function(loopItem) {
              let html = templateHTML.replace(/__LOOP_VAR__/g, loopItem);
              container.insertAdjacentHTML('beforeend', html);
            });
          }
        })();
      </script>
    `;
  }
  
  replaceLoopVariable(el, varName, placeholder) {
    const newEl = JSON.parse(JSON.stringify(el)); // Deep clone
    
    // Replace in props
    if (newEl.props) {
      for (const [key, value] of Object.entries(newEl.props)) {
        if (value.type === 'variable' && value.value === varName) {
          newEl.props[key] = { type: 'string', value: placeholder };
        } else if (value.type === 'string' && value.value.includes(`{${varName}}`)) {
          newEl.props[key] = { type: 'string', value: value.value.replace(`{${varName}}`, placeholder) };
        }
      }
    }
    
    // Replace in children
    if (newEl.children) {
      newEl.children = newEl.children.map(child => this.replaceLoopVariable(child, varName, placeholder));
    }
    
    return newEl;
  }
  
  interpolateTemplateString(text) {
    return text.replace(/\{([^}]+)\}/g, (match, varName) => {
      return `<span class="psl-var" data-var="${varName.trim()}"></span>`;
    });
  }

  actionToJS(action, elementId) {
    if (action.type === 'assignment') {
      const key = action.key;
      const value = this.valueToJSString(action.value);
      
      if (key.includes('.')) {
        const [elemName, prop] = key.split('.');
        
        const isPage = this.ast.pages && this.ast.pages[elemName];
        
        if (isPage) {
          if (prop === 'hide') {
            return `
              const pageEl = document.querySelector('[data-page="${elemName}"]');
              if (pageEl) {
                pageEl.classList.remove('active');
                pageEl.style.display = 'none';
              }
            `;
          } else if (prop === 'show') {
            return `
              document.querySelectorAll('[data-page]').forEach(p => p.classList.remove('active'));
              const pageEl = document.querySelector('[data-page="${elemName}"]');
              if (pageEl) {
                pageEl.classList.add('active');
                pageEl.style.display = 'block';
              }
            `;
          }
        }
        
        return `
          if (window.psl_elements && window.psl_elements['${elemName}']) {
            const el = window.psl_elements['${elemName}'];
            const propValue = ${value};
            if ('${prop}' === 'text') {
              el.textContent = propValue;
            } else if ('${prop}' === 'value') {
              el.value = propValue;
            } else if ('${prop}' === 'src') {
              el.src = propValue;
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
            } else if ('${prop}' === 'width') {
              el.style.width = propValue + 'px';
            } else if ('${prop}' === 'height') {
              el.style.height = propValue + 'px';
            } else {
              el.setAttribute('data-' + '${prop}', propValue);
            }
            window.psl_triggerWatchers('${elemName}');
          }
        `;
      } else {
        return `
          window.psl_vars.${key} = ${value};
          window.psl_triggerWatchers('${key}');
        `;
      }
    } 
    else if (action.type === 'functionCall') {
        const args = action.args.map(a => this.valueToJSString(a)).join(', ');
        
        if (action.name === 'log') {
          return `console.log(${args});\n`;
        }
        if (action.name === 'alert') {
          return `alert(${args});\n`;
        }
        if (action.name === 'notify') {
          return `notify(${args});\n`;
        }
        if (action.name === 'save') {
          return `save(${args});\n`;
        }
        if (action.name === 'load') {
          return `load(${args});\n`;
        }
        
        return `window.${action.name}(${args});\n`;
    }
    else if (action.type === 'if') {
        const cond = this.valueToJSString(action.condition); 
        const ifBody = action.body.map(s => this.actionToJS(s, elementId)).join('');
        let js = `if (${cond}) { ${ifBody} }`;

        if (action.elseBody && action.elseBody.length > 0) {
            const elseBody = action.elseBody.map(s => this.actionToJS(s, elementId)).join('');
            js += ` else { ${elseBody} }`;
        }
        
        return js + '\n';
    }
    else if (action.type === 'wait') {
        const duration = this.valueToJSString(action.duration);
        const body = action.body.map(s => this.actionToJS(s, elementId)).join('');
        return `await new Promise(resolve => setTimeout(resolve, ${duration})); ${body}`;
    }

    return '';
  }

  generateJavaScript() {
    let js = `// Global variables and reactive system\n`;
    
    // Initialize variables
    for (const [name, value] of Object.entries(this.ast.globalVariables)) {
      js += `window.psl_vars.${name} = ${this.valueToJSString(value)};\n`;
    }
    
    // Watchers system
    js += `
window.psl_triggerWatchers = function(varName) {
  window.psl_watchers.forEach(function(watcher) {
    if (watcher.variable === varName) {
      watcher.callback();
    }
  });
  
  // Update template strings
  document.querySelectorAll('.psl-var').forEach(function(el) {
    const varName = el.getAttribute('data-var');
    if (window.psl_vars[varName] !== undefined) {
      el.textContent = window.psl_vars[varName];
    }
  });
};
`;

    // Setup watchers
    for (const watcher of this.ast.watchers) {
      const varName = this.valueToString(watcher.variable);
      const actions = watcher.actions.map(a => this.actionToJS(a, 'global')).join('');
      js += `
window.psl_watchers.push({
  variable: '${varName}',
  callback: function() {
    ${actions}
  }
});
`;
    }

    // Setup intervals
    for (const interval of this.ast.intervals) {
      const duration = this.valueToJSString(interval.duration);
      const actions = interval.actions.map(a => this.actionToJS(a, 'global')).join('');
      js += `
window.psl_intervals.push(setInterval(function() {
  ${actions}
}, ${duration}));
`;
    }

    // Functions
    for (const [funcName, func] of Object.entries(this.ast.functions)) {
      const params = func.params.join(', ');
      const body = func.body.map(stmt => this.statementToJS(stmt)).join('');
      js += `window.${funcName} = function(${params}) { ${body} };\n`;
    }

    // Global statements
    if (this.ast.statements && this.ast.statements.length > 0) {
      for (const stmt of this.ast.statements) {
        js += this.statementToJS(stmt);
      }
    }
    
    // Key handlers
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
    
    // Helper for rendering elements in for loops
    js += `
window.psl_renderElement = function(el, pageName, pagePadding, loopVar) {
  // This is a placeholder - in a real implementation, this would recreate the element
  return '<div>Loop item</div>';
};
`;

    js += `window.showPage = function(name) {
      document.querySelectorAll('[data-page]').forEach(p => p.classList.remove('active'));
      const p = document.querySelector('[data-page="' + name + '"]');
      if (p) p.classList.add('active');
    };`;
    
    // Initialize template strings
    js += `
setTimeout(function() {
  document.querySelectorAll('.psl-var').forEach(function(el) {
    const varName = el.getAttribute('data-var');
    if (window.psl_vars[varName] !== undefined) {
      el.textContent = window.psl_vars[varName];
    }
  });
}, 0);
`;

    return js;
  }

  statementToJS(stmt) {
    if (stmt.type === 'assignment') {
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
    if (stmt.type === 'if') {
      const cond = this.valueToJSString(stmt.condition); 
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
    if (value.type === 'array') {
      return '[' + value.elements.map(e => this.valueToString(e)).join(', ') + ']';
    }
    if (value.type === 'object') {
      const pairs = Object.entries(value.properties).map(([k, v]) => `${k}: ${this.valueToString(v)}`);
      return '{' + pairs.join(', ') + '}';
    }
    return '';
  }

  valueToJSString(value) {
    if (!value) return 'null';
    if (value.type === 'string') return `"${value.value.replace(/"/g, '\\"')}"`;
    if (value.type === 'number') return value.value;
    if (value.type === 'boolean') return value.value ? 'true' : 'false';
    if (value.type === 'variable') return `window.psl_vars.${value.value}`;
    if (value.type === 'array') {
      const elements = value.elements.map(e => this.valueToJSString(e)).join(', ');
      return `[${elements}]`;
    }
    if (value.type === 'object') {
      const pairs = Object.entries(value.properties).map(([k, v]) => `${k}: ${this.valueToJSString(v)}`);
      return `{${pairs.join(', ')}}`;
    }
    if (value.type === 'dotNotation') {
      const prop = value.property;
      if (prop === 'text') {
        return `(window.psl_elements.${value.object} ? window.psl_elements.${value.object}.textContent : '')`;
      } else if (prop === 'value') {
        return `(window.psl_elements.${value.object} ? window.psl_elements.${value.object}.value : '')`;
      } else if (prop === 'src') {
        return `(window.psl_elements.${value.object} ? window.psl_elements.${value.object}.src : '')`;
      } else if (prop === 'bg') {
        return `(window.psl_elements.${value.object} ? window.psl_elements.${value.object}.style.backgroundColor : '')`;
      } else if (prop === 'color') {
        return `(window.psl_elements.${value.object} ? window.psl_elements.${value.object}.style.color : '')`;
      } else if (prop === 'size') {
        return `(window.psl_elements.${value.object} ? parseInt(window.psl_elements.${value.object}.style.fontSize) : 0)`;
      } else if (prop === 'width') {
        return `(window.psl_elements.${value.object} ? parseInt(window.psl_elements.${value.object}.style.width) : 0)`;
      } else if (prop === 'height') {
        return `(window.psl_elements.${value.object} ? parseInt(window.psl_elements.${value.object}.style.height) : 0)`;
      } else {
        return `(window.psl_elements.${value.object} ? window.psl_elements.${value.object}.getAttribute('data-${prop}') : '')`;
      }
    }
    if (value.type === 'binaryExpression') {
      const leftJS = this.valueToJSString(value.left);
      const rightJS = this.valueToJSString(value.right);
      const op = value.operator === '==' ? '===' : value.operator;
      return `(${leftJS} ${op} ${rightJS})`;
    }
    if (value.type === 'ternary') {
      const condJS = this.valueToJSString(value.condition);
      const trueJS = this.valueToJSString(value.trueExpr);
      const falseJS = this.valueToJSString(value.falseExpr);
      return `(${condJS} ? ${trueJS} : ${falseJS})`;
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

/* Appended safe completion */


  // Fallback for any other value types
  return 'null';
}

// If any methods were left open, ensure class closure
}

// Export classes for Node usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PSLTokenizer, PSLParser, PSLCompiler };
}
