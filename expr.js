(function(global) {
    'use strict';

    const TOKEN_STR = 'str';
    const TOKEN_NUM = 'num';
    const TOKEN_KEYWORD = 'kw';
    const TOKEN_VAR = 'var';
    const TOKEN_PUNC = 'punc';
    const TOKEN_OPERATOR = 'op';

    const EXPR_PROG = 'prog';
    const EXPR_FUNC = 'func';
    const EXPR_ASSIGN = 'assign';
    const EXPR_BINARY = 'binary';
    const EXPR_IF = 'if';
    const EXPR_BOOL = 'bool';
    const EXPR_CALL = 'call';
    const EXPR_LIST = 'list';
    const EXPR_COND = 'cond';
    const EXPR_NUM = TOKEN_NUM;
    const EXPR_STR = TOKEN_STR;
    const EXPR_VAR = TOKEN_VAR;
    
    const KW_TRUE = 'true';
    const KW_FALSE = 'false';
    const KW_IF = 'if';
    const KW_THEN = 'then';
    const KW_ELSE = 'else';
    const KEYWORDS = [KW_TRUE, KW_FALSE, KW_IF, KW_THEN, KW_ELSE];

    const PRECEDENCE = {
        '=': 1,
        '||': 2,
        '&&': 3,
        '<': 7, '<=': 7, '>': 7, '>=': 7, '==': 7, '!=': 7, '+': 10, '-': 10,
        '*': 20, '/': 20, '%': 20,
    }

    const InputStream = (input) => {
        let pos = 0;
        let line = 1;
        let col = 0;

        return {
            next() { 
                let ch = input.charAt(pos++);
                if (ch === '\n') {
                    line++;
                    col = 0;
                } else {
                    col++;
                }
                return ch;
            },
            peek() {
                return input.charAt(pos);
            },
            eof() {
                return this.peek() === '';
            },
            croak(msg) {
                throw new ParserError(`${msg} (${line}:${col})`, { input, line, col, pos });
            }
        }
    }

    const TokenStream = (input) => {
        let current = null;

        const isKeyword = (x) => KEYWORDS.indexOf(x) >= 0;
        const isDigit = (ch) => /\d/i.test(ch);
        const isIdStart = (ch) => /[a-z_]/i.test(ch);
        const isId = (ch) => isIdStart(ch) || /\d/.test(ch) || ch === '_';
        const isOpChar = (ch) => '+-*/%=&|<>!?:'.indexOf(ch) >= 0;
        const isPunc = (ch) => ',;(){}[]'.indexOf(ch) >= 0;
        const isWhitespace = (ch) => ' \t\n'.indexOf(ch) >= 0;
        const isComment = (ch) => ch === '#';
        const isString = (ch) => '"\''.indexOf(ch) >= 0;

        function readWhile(predicate) {
            let str = '';
            while (!input.eof() && predicate(input.peek())) {
                str += input.next();
            }
            return str;
        }

        function readNumber() {
            let hasDot = false;
            let number = readWhile((ch) => {
                if (ch === '.') {
                    if (hasDot) {
                        return false;
                    }
                    hasDot = true;
                    return true;
                }
                return isDigit(ch);
            });

            return {
                type: TOKEN_NUM,
                value: parseFloat(number)
            }
        }

        function readIdent() {
            let id = readWhile(isId);
            return {
                type: isKeyword(id) ? TOKEN_KEYWORD : TOKEN_VAR,
                value: id
            }
        }

        function readEscaped(end) {
            let escaped = false;
            let str = '';

            while(!input.eof()) {
                let ch = input.next();
                if (escaped) {
                    str += ch;
                    escaped = false;
                } else if (ch === '\\') {
                    escaped = true;
                } else if (end.indexOf(ch) >= 0) {
                    break;
                } else {
                    str += ch;
                }
            }
            return str;
        }

        function readString() {
            input.next();
            return {
                type: TOKEN_STR,
                value: readEscaped('"\'')
            }
        }

        function readPunc() {
            return {
                type: TOKEN_PUNC,
                value: input.next()
            }
        }

        function readOperator() {
            return {
                type: TOKEN_OPERATOR,
                value: readWhile(isOpChar)
            }
        }

        function skipComment() {
            readWhile((ch) => ch !== '\n');
            input.next();
        }

        function readNext() {
            readWhile(isWhitespace);

            if (input.eof()) {
                return null;
            }

            let ch = input.peek();

            if (isComment(ch)) {
                skipComment();
                return readNext();
            }
            if (isString(ch)) {
                return readString();
            }
            if (isDigit(ch)) {
                return readNumber();
            }
            if (isIdStart(ch)) {
                return readIdent();
            }
            if (isPunc(ch)) {
                return readPunc();
            }
            if (isOpChar(ch)) {
                return readOperator();
            }
            input.croak("Can't handle character: " + ch);
        }

        return {
            next() {
                let token = current;
                current = null;
                return token || readNext();
            },
            peek() {
                return current || (current = readNext());
            },
            eof() {
                return this.peek() === null;
            },
            croak: input.croak
        }
    }

    const Parser = () => {
        const isPunc = (ch, input) => {
            let token = input.peek();
            return token && token.type === TOKEN_PUNC && (!ch || token.value === ch) && token; //taka sztuczka by zwrócić wartość token
        }
        const isOp = (op, input) => {
            let token = input.peek();
            return token && token.type === TOKEN_OPERATOR && (!op || token.value === op) && token;
        }
        const isKw = (kw, input) => {
            let token = input.peek();
            return token && token.type === TOKEN_KEYWORD && (!kw || token.value === kw) && token;
        }
        const isVar = (token, input) => [TOKEN_VAR, TOKEN_NUM, TOKEN_STR].indexOf(token.type) >= 0;
        
        const skipPunc = (ch, input) => {
            if (isPunc(ch, input)) {
                input.next();
            } else {
                input.croak(`Expecting punctuation: "${ch}"`);
            }
        }
        const skipKw = (kw, input) => {
            if (isKw(kw, input)) {
                input.next();
            } else {
                input.croak(`Expecting keyword: "${kw}"`);
            }
        }
        const skipOp = (op, input) => {
            if (isOp(op, input)) {
                input.next();
            } else {
                input.croak(`Expecting operator: "${op}"`);
            }
        }
        const unexpected = (input) => {
            let token = JSON.stringify(input.peek());
            input.croak(`Unexpected token: ${token}`);
        }
        
        function parseRoot(input) {
            const prog = [];
            while(!input.eof()) {
                prog.push(parseExpression(input));
                if (!input.eof()) {
                    skipPunc(';', input);
                }
            }
            return  {
                type: EXPR_PROG,
                prog: prog
            }
        }

        function parseExpression(input) {
            let expr = parseAtom(input);
            expr = maybeBinary(expr, 0, input);
            expr = maybeConditional(expr, input);
            return maybeCall(() => expr, input);
        }

        function parseIf(input) {
            skipKw(KW_IF, input);
            let cond = parseExpression(input);
            if (!isPunc('{', input)) {
                skipKw(KW_THEN, input);
            }
            let then = parseExpression(input);
            let ret = {
                type: EXPR_COND,
                cond: cond,
                then: then
            }
            if (isKw(KW_ELSE, input)) {
                input.next();
                ret.else = parseExpression(input);
            }
            return ret;
        }

        function parseBool(input) {
            return {
                type: EXPR_BOOL,
                value: input.next().value === 'true'
            }
        }

        function parseCall(func, input) {
            return {
                type: EXPR_CALL,
                func: func,
                args: delimeted('(', ')', ',', parseExpression, input)
            }
        }

        function parseList(input) {
            return {
                type: EXPR_LIST,
                list: delimeted('[', ']', ',', parseExpression, input)
            }
        }

        function parseAtom(input) {
            return maybeCall(() => {
                if (isPunc('(', input)) {
                    input.next();
                    let exp = parseExpression(input);
                    skipPunc(')', input);
                    return exp;
                }
                if (isPunc('{', input)) {
                    return parseProg(input);
                }
                if (isPunc('[', input)) {
                    return parseList(input);
                }
                if (isKw(KW_IF, input)) {
                    return parseIf(input);
                }
                if (isKw(KW_TRUE, input) || isKw(KW_FALSE, input)) {
                    return parseBool(input);
                }

                let token = input.next();
                if (isVar(token)) {
                    return token;
                }

                unexpected(input);
            }, input);
        }

        function delimeted(start, stop, separator, parser, input) {
            let args = [];
            let first = true;

            skipPunc(start, input);

            while(!input.eof()) {
                if (isPunc(stop, input)) {
                    break;
                }
                if (first) {
                    first = false;
                } else {
                    skipPunc(separator, input);
                }
                if (isPunc(stop, input)) {
                    break;
                }
                args.push(parser(input));
            }

            skipPunc(stop, input);

            return args;
        }

        function maybeCall(expr, input) {
            expr = expr();
            return isPunc('(', input) ? parseCall(expr, input) : expr;
        }

        function maybeBinary(left, myPrec, input) {
            let token = isOp(null, input);
            if (token) {
                let hisPrec = PRECEDENCE[token.value];
                if (hisPrec > myPrec) {
                    input.next();
                    return maybeBinary({
                        type: token.value === '=' ? EXPR_ASSIGN : EXPR_BINARY,
                        operator: token.value,
                        left: left,
                        right: maybeBinary(parseAtom(input), hisPrec, input)
                    }, myPrec, input);
                }
            }
            return left;
        }

        function maybeConditional(expr, input) {
            let token = isOp('?', input);
            if (token) {
                input.next();
                return {
                    type: EXPR_COND,
                    cond: expr,
                    then: parseExpression(input),
                    else: (() => {
                        skipOp(':', input);
                        return parseExpression(input)
                    })()
                }
            }
            return expr;
        }

        return {
            parse: parseRoot
        }
    }

    function isNumber(n) {
        return !isNaN(parseFloat(n)) && isFinite(n);
    }

    function applyOp(op, a, b) {
        function num(x) {
            if (!isNumber(x)) {
                throw new InvalidTypeError('Expected number but got ' + x);
            }
            return x;
        }
        function div(x) {
            if (num(x) == 0) {
                throw new Error('Divide by zero');
            }
            return x;
        }
        switch (op) {
            case '+'  : return num(a) + num(b);
            case '-'  : return num(a) - num(b);
            case '*'  : return num(a) * num(b);
            case '/'  : return num(a) / div(b);
            case '%'  : return num(a) % div(b);
            case '&&' : return (a !== false && a !== '' && a !== null) && b;
            case '||' : return (a !== false && a !== '' && a !== null) ? a : b;
            case '<'  : return num(a) < num(b);
            case '>'  : return num(a) > num(b);
            case '<=' : return num(a) <= num(b);
            case '>=' : return num(a) >= num(b);
            case '==' : return a === b;
            case '!=' : return a !== b;
        }
        throw new Error("Can't apply operator " + op);
    }

    function liveEvaluate(expr, env) {
        const primaryExpr = expr;
        const observed = [];
        const live = new LiveValue();
        const reevaluate = (function(expr, env) {
            return () => { 
                try {
                    live.value = evaluate(expr, env);
                } catch (e) {
                    live.error(e);
                }
            }
        })(expr, env);

        function evaluate(expr, env) {  //FIXME: przenieść poza funkcję
            switch(expr.type) {
                case EXPR_NUM:
                case EXPR_STR:
                case EXPR_BOOL:
                    return expr.value;
                case EXPR_VAR:
                    let value = env.get(expr.value);
                    if (observed.indexOf(expr.value) === -1) {
                        observed.push(expr.value);
                        env.watch(expr.value, reevaluate)
                    }
                    return value;
                case EXPR_LIST:
                    return expr.list.map((item) => evaluate(item, env));
                case EXPR_BINARY:
                    return applyOp(
                        expr.operator,
                        evaluate(expr.left, env),
                        evaluate(expr.right, env)
                    );
                case EXPR_COND:
                    let cond = evaluate(expr.cond, env);
                    if (cond) {
                        return evaluate(expr.then, env);
                    }
                    return expr.else ? evaluate(expr.else, env) : false;
                case EXPR_PROG:
                    let val = false;
                    expr.prog.forEach((expr) => { val = evaluate(expr, env); });
                    return val;
                case EXPR_CALL:
                    let func = evaluate(expr.func, env);
                    return func.apply(null, expr.args.map((arg) => evaluate(arg, env) ));
                default:
                    throw new Error("I don't know how to evaluate " + expr.type);
            }
        }

        reevaluate();
 
        return live;
    }

    class Environment {
        constructor(parent) {
            this.vars = Object.create(parent ? parent.vars : null);
            this.aliases = Object.create(parent ? parent.aliases : null);
            this.parent = parent;

            const _watchers = Object.create(null);

            this.watch = (name, callback) => {
                if (!(name in _watchers)) {
                    _watchers[name] = [];
                }
                _watchers[name].push(callback);
            }

            this.notify = (name) => {
                let value = this.get(name);
                if (_watchers[name]) {
                    _watchers[name].forEach((callback) => { callback(value); });
                }
            }
        }

        extend () {
            return new Environment(this);
        }

        lookup (name) {
            let scope = this;
            while (scope) {
                if (Object.prototype.hasOwnProperty.call(scope.vars, name)) {
                    return scope;
                }
                scope = scope.parent;
            }
        }

        get (name) {
            if (name in this.aliases) {
                name = this.aliases[name];
            }
            if (name in this.vars) {
                return this.vars[name];
            }
            throw new Error("Undefined variable " + name);
        }

        set (name, value) {
            let scope = this.lookup(name);
            if (!scope && this.parent) {
                throw new Error("Undefined variable " + name);
            }
            let old = (scope || this).vars[name];

            if (old !== value) {
                (scope || this).vars[name] = value;
                this.notify(name);
            }
        }

        def (name, value, descriptor) {
            if (descriptor) {
                descriptor.value = value;
                Object.defineProperty(this.vars, name, descriptor);
            } else {
                this.vars[name] = value;
            }
        }

        live (name) {
            let live = new Expr.LiveValue(this.get(name));
            this.watch(name, (val) => {
                live.value = val;
            });
            return live;
        }

        alias (target, alias) {
            this.aliases[alias] = target;
        }

        list () {
            return Object.keys(this.vars);
        }
    }

    class LiveValue {
        constructor(value) {
            let _value = value;
            const _watchers = [];
            const _map = (value, callback) => {
                return Array.isArray(value) ? value.map(callback) : [value].map(callback);
            }
            const _reduce = (value, callback, start) => {
                return Array.isArray(value) ? value.reduce(callback, start) : [value].reduce(callback, start);
            }

            this.setValue = (value) => { 
                _value = value; 
                _watchers.forEach((watcher) => {
                    watcher.callback(_value);
                }); 
            }
            this.getValue = () => _value;
            this.watch = (callback, error) => { 
                _watchers.push({ callback, error }); 
                callback(_value);
                return this;
            }
            this.map = (callback, error) => {
                const live = new LiveValue();
                let callback2 = (value) => {
                    live.value = _map(value, callback);
                }
                _watchers.push({ callback: callback2, error, asMap: true });
                callback2(_value);
                return live;
            }
            this.reduce = (callback, start, error) => {
                const live = new LiveValue();
                let callback2 = (value) => {
                    live.value = _reduce(value, callback, start);
                }
                _watchers.push({ callback: callback2, error, asReduce: true });
                callback2(_value);
                return live;
            }
            this.error = (err) => {
                this.setValue(null);
                _watchers.forEach((watcher) => { 
                    if (watcher.error) watcher.error(err); 
                });
                return this;
            }
        }

        set value(value) {
            this.setValue(value);
        }

        get value() {
            return this.getValue();
        }
    }

    class InvalidTypeError extends Error {}
    class ParserError extends Error {
        constructor(msg, data) {
            super(msg);
            this.getData = () => data;
        }
    }


    global.Expr = {
        InputStream,
        TokenStream,
        LiveValue,
        Environment,
        InvalidTypeError,
        ParserError,
        Parser: Parser(),
        evaluate: liveEvaluate,
        run (expr, env) {
            return liveEvaluate(this.Parser.parse(TokenStream(InputStream(expr))), env);
        }
    }

})(this);