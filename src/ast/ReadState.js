var types = require("../types"),
    util = require("../util");

var Stmt = require("../stmt/Stmt"),
    ExprI32 = require("../stmt/ExprI32"),
    ExprF32 = require("../stmt/ExprF32"),
    ExprF64 = require("../stmt/ExprF64"),
    ExprVoid = require("../stmt/ExprVoid");

/**
 * AST read state.
 * @constructor
 * @param {!ast.Reader} reader
 * @param {number} popState
 * @exports ast.ReadState
 */
function ReadState(reader, popState) {

    /**
     * AstReader reference.
     * @type {!ast.Reader}
     */
    this.reader = reader;

    /**
     * Pop state.
     * @type {number}
     */
    this.popState = popState;

    /**
     * Current type.
     * @type {number|undefined}
     */
    this._type = undefined;

    /**
     * Current code.
     * @type {number|!{op: number, imm: number}|undefined}
     */
    this._code = undefined;

    /**
     * Current statement.
     * @type {!stmt.BaseStmt|undefined}
     */
    this._stmt = undefined;
}

module.exports = ReadState;

/**
 * Gets the current function's return type.
 * @returns {number}
 */
ReadState.prototype.rtype = function() {
    return this.reader.signature.returnType;
};

/**
 * Reads the next opcode.
 * @param {number} type
 * @returns {!{op: number, imm: number|null}}
 */
ReadState.prototype.code = function(type) {
    this._type = type;
    return this._code = util.unpackCode(this.reader.bufferQueue.readUInt8());
};

/**
 * Reads the next single-byte opcode.
 * @returns {number}
 */
ReadState.prototype.code_u8 = function() {
    this._type = types.RType.Void;
    return this.reader.bufferQueue.readUInt8();
};

/**
 * Reads the next varint.
 * @returns {number}
 */
ReadState.prototype.varint = function() {
    return this.reader.bufferQueue.readVarint();
};

/**
 * Reads the next unsigned 8bit integer.
 * @returns {number}
 */
ReadState.prototype.u8 = function() {
    return this.reader.bufferQueue.readUInt8();
};

/**
 * Reads the next 32bit float.
 * @returns {number}
 */
ReadState.prototype.f32 = function() {
    return this.reader.bufferQueue.readFloatLE();
};

/**
 * Reads the next 64bit double.
 * @returns {number}
 */
ReadState.prototype.f64 = function() {
    return this.reader.bufferQueue.readDoubleLE();
};

/**
 * Advances the backing buffer queue by the amount of bytes previously read.
 */
ReadState.prototype.advance = function() {
    this.reader.bufferQueue.advance();
};

/**
 * Resets the backing buffer queue to the previous index and offset.
 */
ReadState.prototype.reset = function() {
    this.reader.bufferQueue.reset();
};

/**
 * Gets the constant of matching type at the specified index.
 * @param {number} index
 * @returns {!reflect.Constant}
 */
ReadState.prototype.const = function(index) {
    switch (this._type) {
        case types.Type.I32:
            return this.reader.assembly.constantsI32[index];
        case types.Type.F32:
            return this.reader.assembly.constantsF32[index];
        case types.Type.F64:
            return this.reader.assembly.constantsF64[index];
    }
};

/**
 * Gets the local variable at the specified index.
 * @param {number} index
 * @returns {!reflect.LocalVariable}
 */
ReadState.prototype.local = function(index) {
    return this.reader.definition.variables[index];
};

/**
 * Gets the global variable at the specified index.
 * @param {number} index
 * @returns {!reflect.GlobalVariable}
 */
ReadState.prototype.global = function(index) {
    return this.reader.assembly.globalVariables[index];
};

/**
 * Gets the function declaration at the specified index.
 * @param {number} index
 * @returns {!reflect.FunctionDeclaration}
 */
ReadState.prototype.internal = function(index) {
    return this.reader.assembly.functionDeclarations[index];
};

/**
 * Gets the function pointer table at the specified index.
 * @param {number} index
 * @returns {!reflect.FunctionPointerTable}
 */
ReadState.prototype.indirect = function(index) {
    return this.reader.assembly.functionPointerTables[index];
};

/**
 * Gets the function import signature at the specified index.
 * @param {number} index
 * @returns {!reflect.FunctionSignature}
 */
ReadState.prototype.import = function(index) {
    return this.reader.assembly.functionImportSignatures[index];
};

/**
 * Pushes a state or a list of state to the state queue.
 * @param {number|!Array.<number>} states
 */
ReadState.prototype.expect = function(states) {
    if (typeof states === 'number') {
        if (this._stmt && !this.reader.skipAhead) {
            this.reader.stack.push(this._stmt);
            this.reader.state.push(this.popState);
        }
        this.reader.state.push(states);
    } else {
        if (states.length === 0)
            return;
        if (this._stmt && !this.reader.skipAhead) {
            this.reader.stack.push(this._stmt);
            this.reader.state.push(this.popState);
        }
        for (var i=states.length-1; i>=0; --i)
            this.reader.state.push(states[i]);
    }
};

/**
 * Emits a specific opcode.
 * @param {number} code
 * @param {(number|!Array.<number>)=} operands
 * @returns {!stmt.BaseStmt|undefined}
 */
ReadState.prototype.emit_code = function(code, operands) {
    if (this.reader.skipAhead) {
        this.reader.bufferQueue.advance();
        return;
    }
    if (typeof this._type === 'number')
        switch (this._type) {
            case types.RType.I32:
                this._stmt = new ExprI32(code, operands);
                break;
            case types.RType.F32:
                this._stmt = new ExprF32(code, operands);
                break;
            case types.RType.F64:
                this._stmt = new ExprF64(code, operands);
                break;
            case types.RType.Void:
                this._stmt = new ExprVoid(code, operands);
                break;
            default:
                throw Error("illegal type: "+this._type);
        }
    else
        this._stmt = new Stmt(code, operands);
    this.reader.stack[this.reader.stack.length-1].add(this._stmt);
    this.reader.bufferQueue.advance();
    return this._stmt;
};

/**
 * Emits the matching opcode for the previous read operation.
 * @param {(number|!Array.<number>)=} operands
 * @returns {!stmt.BaseStmt|undefined}
 */
ReadState.prototype.emit = function(operands) {
    return this.emit_code(typeof this._code === 'number' ? this._code : this._code.op, operands);
};

/**
 * Finishes the read state.
 */
ReadState.prototype.finish = function() {
    this.reader = this._type = this._code = this._stmt = null;
};