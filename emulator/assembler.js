// LWCPU4 in-browser assembler.
//
// Supports a useful subset of the customasm syntax used by LWCPU4.asm:
//   - All instructions from LWCPU4.asm (nop, spc, jmp, jif, scd, mov,
//     add/adc/sub/sbc/cmp, and/or/xor, shr/ror/asr, shl, rol,
//     bcs/bcc/beq/bne/bmi/bpl)
//   - Registers: a, b, ST   (case-insensitive)
//   - Conditions: c, z, n, nc, nz, nn
//   - Segments: cs, ds
//   - Labels: `name:` and local `.name:` (scoped to last global label)
//   - Numeric literals: 0x.., 0b.., decimal, char 'X'
//   - Expressions: label, number, `$` (current addr), `+` and `-`
//   - Directives: #addr <expr>, #d <bytes-or-string>, #d8 ..., #str "...",
//                 #bankdef name { ... } (block ignored; #addr/#outp honored)
//   - Comments: `;` and `//`
//
// Returns { ok, bytes, baseAddr, errors, listing }.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LWCPU4Assembler = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const REG  = { a: 0b01, b: 0b10, st: 0b11 };
  const COND = { c: 0b0001, z: 0b0010, n: 0b0100,
                 nc: 0b1001, nz: 0b1010, nn: 0b1100 };
  const SEG  = { cs: 0b00, ds: 0b01 };

  const MNEMONICS = new Set([
    'nop','spc','jmp','jif','scd','mov',
    'add','adc','sub','sbc','cmp','and','or','xor',
    'shr','ror','asr','shl','rol',
    'bcs','bcc','beq','bne','bmi','bpl'
  ]);

  // ─── Helpers ─────────────────────────────────────────────────────────
  function isReg(s)  { return Object.prototype.hasOwnProperty.call(REG,  s.toLowerCase()); }
  function isCond(s) { return Object.prototype.hasOwnProperty.call(COND, s.toLowerCase()); }
  function isSeg(s)  { return Object.prototype.hasOwnProperty.call(SEG,  s.toLowerCase()); }
  function regBits(s)  { return REG[s.toLowerCase()]; }
  function condBits(s) { return COND[s.toLowerCase()]; }
  function segBits(s)  { return SEG[s.toLowerCase()]; }

  function stripComments(line) {
    // Strip ; and // comments, but only if not inside a string.
    let out = '';
    let inStr = false;
    let quote = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inStr) {
        out += c;
        if (c === '\\' && i + 1 < line.length) { out += line[++i]; continue; }
        if (c === quote) inStr = false;
        continue;
      }
      if (c === '"' || c === "'") { inStr = true; quote = c; out += c; continue; }
      if (c === ';') break;
      if (c === '/' && line[i + 1] === '/') break;
      out += c;
    }
    return out;
  }

  // ─── Operand parsing ─────────────────────────────────────────────────
  // Splits at top-level commas (ignoring commas inside [..] or "..").
  function splitOperands(s) {
    const out = [];
    let depth = 0, inStr = false, quote = '';
    let cur = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inStr) {
        cur += c;
        if (c === '\\' && i + 1 < s.length) { cur += s[++i]; continue; }
        if (c === quote) inStr = false;
        continue;
      }
      if (c === '"' || c === "'") { inStr = true; quote = c; cur += c; continue; }
      if (c === '[' || c === '(') { depth++; cur += c; continue; }
      if (c === ']' || c === ')') { depth--; cur += c; continue; }
      if (c === ',' && depth === 0) {
        out.push(cur.trim());
        cur = '';
        continue;
      }
      cur += c;
    }
    if (cur.trim().length > 0 || out.length > 0) out.push(cur.trim());
    return out.filter(x => x.length > 0);
  }

  function classifyOperand(s) {
    s = s.trim();
    if (s.startsWith('[') && s.endsWith(']')) {
      const inner = s.slice(1, -1).trim();
      if (isReg(inner)) return { kind: 'mem_reg', reg: regBits(inner) };
      return { kind: 'mem_imm', expr: inner };
    }
    if (isReg(s))  return { kind: 'reg',  reg:  regBits(s) };
    if (isCond(s)) return { kind: 'cond', cond: condBits(s) };
    if (isSeg(s))  return { kind: 'seg',  seg:  segBits(s) };
    return { kind: 'imm', expr: s };
  }

  // ─── Expression evaluator ────────────────────────────────────────────
  // Supports: number literals (0x.., 0b.., decimal), char literals 'X',
  // label names, `$` for current addr, and `+`/`-` between terms.
  function tokenizeExpr(expr) {
    const tokens = [];
    let i = 0;
    while (i < expr.length) {
      const c = expr[i];
      if (c === ' ' || c === '\t') { i++; continue; }
      if (c === '+' || c === '-') { tokens.push({ t: 'op', v: c }); i++; continue; }
      if (c === '$') { tokens.push({ t: 'here' }); i++; continue; }
      if (c === "'") {
        // 'X' or '\n'
        i++;
        let val;
        if (expr[i] === '\\') {
          i++;
          val = unescape(expr[i]);
          i++;
        } else {
          val = expr.charCodeAt(i);
          i++;
        }
        if (expr[i] !== "'") throw new Error('unterminated char literal in: ' + expr);
        i++;
        tokens.push({ t: 'num', v: val });
        continue;
      }
      if (/[0-9]/.test(c)) {
        let j = i;
        while (j < expr.length && /[0-9a-fA-FxXbB]/.test(expr[j])) j++;
        const lit = expr.slice(i, j);
        tokens.push({ t: 'num', v: parseNumLit(lit) });
        i = j;
        continue;
      }
      if (/[A-Za-z_.]/.test(c)) {
        let j = i;
        while (j < expr.length && /[A-Za-z_.0-9]/.test(expr[j])) j++;
        tokens.push({ t: 'name', v: expr.slice(i, j) });
        i = j;
        continue;
      }
      throw new Error('unexpected char in expression: ' + c + ' (in "' + expr + '")');
    }
    return tokens;
  }

  function unescape(c) {
    switch (c) {
      case 'n': return 10;
      case 'r': return 13;
      case 't': return 9;
      case '0': return 0;
      case '\\': return 92;
      case '"': return 34;
      case "'": return 39;
      default:  return c.charCodeAt(0);
    }
  }

  function parseNumLit(s) {
    if (/^0x[0-9a-fA-F]+$/.test(s)) return parseInt(s.slice(2), 16);
    if (/^0b[01]+$/.test(s))         return parseInt(s.slice(2), 2);
    if (/^[0-9]+$/.test(s))          return parseInt(s, 10);
    throw new Error('bad number literal: ' + s);
  }

  function evalExpr(expr, ctx) {
    const tokens = tokenizeExpr(expr);
    if (tokens.length === 0) throw new Error('empty expression');

    // Optional leading sign
    let sign = 1;
    let idx = 0;
    if (tokens[0].t === 'op') {
      sign = tokens[0].v === '-' ? -1 : 1;
      idx = 1;
    }

    let total = sign * resolveTerm(tokens[idx++], ctx);
    while (idx < tokens.length) {
      const op = tokens[idx++];
      if (op.t !== 'op') throw new Error('expected + or -, got ' + JSON.stringify(op));
      if (idx >= tokens.length) throw new Error('trailing operator in expression');
      const term = resolveTerm(tokens[idx++], ctx);
      total += (op.v === '+') ? term : -term;
    }
    return total & 0xFFFF;
  }

  function resolveTerm(tok, ctx) {
    if (tok.t === 'num')  return tok.v | 0;
    if (tok.t === 'here') return ctx.here | 0;
    if (tok.t === 'name') {
      // Try local label first (.foo means parent.foo)
      if (tok.v.startsWith('.')) {
        const full = (ctx.parent || '') + tok.v;
        if (ctx.labels.has(full)) return ctx.labels.get(full);
        throw new Error('unknown local label: ' + tok.v + ' (parent: ' + (ctx.parent || '<none>') + ')');
      }
      if (ctx.labels.has(tok.v)) return ctx.labels.get(tok.v);
      throw new Error('unknown label: ' + tok.v);
    }
    throw new Error('unexpected token ' + JSON.stringify(tok));
  }

  // ─── Instruction encoding ────────────────────────────────────────────
  // Each encoder returns { size, emit(ctx) -> [bytes] } so we can do a
  // size-only pass before label resolution and a real emit pass after.

  function pack(hi, r1, r2) {
    return ((hi & 0xF) << 4) | ((r1 & 3) << 2) | (r2 & 3);
  }

  // expand macros that turn into multiple real instructions
  function expandMacro(mnem, ops, lineno) {
    const m = mnem.toLowerCase();
    if (m === 'shl')  return [{ mnem: 'add', ops: [ops[0], ops[0]], lineno }];
    if (m === 'rol')  return [{ mnem: 'adc', ops: [ops[0], ops[0]], lineno }];
    if (m === 'bcs')  return [{ mnem: 'scd', ops: ['c'],  lineno }, { mnem: 'jif', ops: ops, lineno }];
    if (m === 'bcc')  return [{ mnem: 'scd', ops: ['nc'], lineno }, { mnem: 'jif', ops: ops, lineno }];
    if (m === 'beq')  return [{ mnem: 'scd', ops: ['z'],  lineno }, { mnem: 'jif', ops: ops, lineno }];
    if (m === 'bne')  return [{ mnem: 'scd', ops: ['nz'], lineno }, { mnem: 'jif', ops: ops, lineno }];
    if (m === 'bmi')  return [{ mnem: 'scd', ops: ['n'],  lineno }, { mnem: 'jif', ops: ops, lineno }];
    if (m === 'bpl')  return [{ mnem: 'scd', ops: ['nn'], lineno }, { mnem: 'jif', ops: ops, lineno }];
    return null;
  }

  // Build an encoder plan for a single non-macro instruction.
  // Returns { size, emit(ctx) -> [byte, byte, ...] }.
  function encodeInstr(mnem, opTexts, lineno) {
    const m = mnem.toLowerCase();
    const ops = opTexts.map(classifyOperand);

    const err = (msg) => { const e = new Error('line ' + lineno + ': ' + msg); e.lineno = lineno; throw e; };

    // nop
    if (m === 'nop') {
      if (ops.length !== 0) err('nop takes no operands');
      return { size: 1, emit: () => [0x00] };
    }

    // spc reg
    if (m === 'spc') {
      if (ops.length !== 1 || ops[0].kind !== 'reg') err('spc reg');
      return { size: 1, emit: () => [pack(0x0, ops[0].reg, 0b00)] };
    }

    // jmp / jif
    if (m === 'jmp' || m === 'jif') {
      if (ops.length !== 1) err(m + ' takes one operand');
      const isJif = (m === 'jif');
      if (ops[0].kind === 'reg') {
        return { size: 1, emit: () => [pack(0x1, ops[0].reg, isJif ? 0b01 : 0b00)] };
      }
      if (ops[0].kind === 'imm') {
        return {
          size: 2,
          emit: (ctx) => [pack(0x1, 0, isJif ? 0b01 : 0b00), evalExpr(ops[0].expr, ctx) & 0xFF],
        };
      }
      err('bad operand for ' + m);
    }

    // scd cond
    if (m === 'scd') {
      if (ops.length !== 1 || ops[0].kind !== 'cond') err('scd cond');
      return { size: 1, emit: () => [(0x2 << 4) | (ops[0].cond & 0xF)] };
    }

    // mov has many forms
    if (m === 'mov') {
      if (ops.length !== 2) err('mov takes two operands');
      const a = ops[0], b = ops[1];

      // mov seg, num     => 0x6 @ 0b00 @ seg @ num
      if (a.kind === 'seg' && b.kind === 'imm') {
        return { size: 2, emit: (ctx) => [pack(0x6, 0, a.seg), evalExpr(b.expr, ctx) & 0xFF] };
      }
      // mov seg, reg     => 0x6 @ op1 @ seg
      if (a.kind === 'seg' && b.kind === 'reg') {
        return { size: 1, emit: () => [pack(0x6, b.reg, a.seg)] };
      }
      // mov reg, imm     => 0x3 @ op1 @ 0b00 @ data
      if (a.kind === 'reg' && b.kind === 'imm') {
        return { size: 2, emit: (ctx) => [pack(0x3, a.reg, 0b00), evalExpr(b.expr, ctx) & 0xFF] };
      }
      // mov reg, reg     => 0x3 @ op1 @ op2
      if (a.kind === 'reg' && b.kind === 'reg') {
        return { size: 1, emit: () => [pack(0x3, a.reg, b.reg)] };
      }
      // mov reg, [addr]  => 0x4 @ op1 @ 0b00 @ addr
      if (a.kind === 'reg' && b.kind === 'mem_imm') {
        return { size: 2, emit: (ctx) => [pack(0x4, a.reg, 0b00), evalExpr(b.expr, ctx) & 0xFF] };
      }
      // mov reg, [reg]   => 0x4 @ op1 @ op2
      if (a.kind === 'reg' && b.kind === 'mem_reg') {
        return { size: 1, emit: () => [pack(0x4, a.reg, b.reg)] };
      }
      // mov [addr], reg  => 0x5 @ op1 @ 0b00 @ addr
      if (a.kind === 'mem_imm' && b.kind === 'reg') {
        return { size: 2, emit: (ctx) => [pack(0x5, b.reg, 0b00), evalExpr(a.expr, ctx) & 0xFF] };
      }
      // mov [reg], reg   => 0x5 @ op1 @ op2
      if (a.kind === 'mem_reg' && b.kind === 'reg') {
        return { size: 1, emit: () => [pack(0x5, b.reg, a.reg)] };
      }
      // mov [reg], imm   => 0x5 @ 0b00 @ op2 @ imm
      if (a.kind === 'mem_reg' && b.kind === 'imm') {
        return { size: 2, emit: (ctx) => [pack(0x5, 0, a.reg), evalExpr(b.expr, ctx) & 0xFF] };
      }
      err('no matching mov form');
    }

    // Arithmetic / logic: shared encoding
    const ALU = { add: 0x7, adc: 0x8, sub: 0x9, sbc: 0xA,
                  cmp: 0xB, and: 0xC, or: 0xD, xor: 0xE };
    if (Object.prototype.hasOwnProperty.call(ALU, m)) {
      if (ops.length !== 2) err(m + ' takes two operands');
      const op = ALU[m];
      const a = ops[0], b = ops[1];
      // reg, reg
      if (a.kind === 'reg' && b.kind === 'reg') {
        return { size: 1, emit: () => [pack(op, a.reg, b.reg)] };
      }
      // reg, imm
      if (a.kind === 'reg' && b.kind === 'imm') {
        return { size: 2, emit: (ctx) => [pack(op, a.reg, 0b00), evalExpr(b.expr, ctx) & 0xFF] };
      }
      // imm, reg
      if (a.kind === 'imm' && b.kind === 'reg') {
        return { size: 2, emit: (ctx) => [pack(op, 0b00, b.reg), evalExpr(a.expr, ctx) & 0xFF] };
      }
      err('bad operand types for ' + m);
    }

    // shr / ror / asr
    const SHIFT = { shr: 0b00, ror: 0b01, asr: 0b10 };
    if (Object.prototype.hasOwnProperty.call(SHIFT, m)) {
      if (ops.length !== 1 || ops[0].kind !== 'reg') err(m + ' reg');
      return { size: 1, emit: () => [pack(0xF, ops[0].reg, SHIFT[m])] };
    }

    err('unknown mnemonic: ' + mnem);
  }

  // ─── Source preprocessing ────────────────────────────────────────────
  // Produces an array of "items" describing every meaningful element of
  // the source: labels, directives, and instructions.
  function preprocess(source) {
    const rawLines = source.split(/\r?\n/);
    const items = [];

    // Track whether we're inside a #bankdef { } block. We ignore everything
    // inside except #addr/#outp (which alter the program origin).
    let inBankdef = false;
    let bankBraceDepth = 0;

    for (let lineno = 1; lineno <= rawLines.length; lineno++) {
      let line = stripComments(rawLines[lineno - 1]).trim();
      if (!line) continue;

      // #bankdef ... { ... }
      if (!inBankdef && /^#bankdef\b/i.test(line)) {
        // capture #addr inside the bankdef if any
        const idx = line.indexOf('{');
        if (idx >= 0) {
          inBankdef = true;
          bankBraceDepth = 1;
          // any tail after { on the same line — peek for "}"
          const tail = line.slice(idx + 1);
          for (const ch of tail) {
            if (ch === '{') bankBraceDepth++;
            else if (ch === '}') bankBraceDepth--;
          }
          if (bankBraceDepth <= 0) inBankdef = false;
        } else {
          // single-line bankdef declaration with no block (unusual)
        }
        continue;
      }
      if (inBankdef) {
        // collect #addr inside the bankdef so it sets the base address
        const m = line.match(/^#addr\s+(\S+)/i);
        if (m) items.push({ kind: 'addr', expr: m[1], lineno });
        for (const ch of line) {
          if (ch === '{') bankBraceDepth++;
          else if (ch === '}') bankBraceDepth--;
        }
        if (bankBraceDepth <= 0) inBankdef = false;
        continue;
      }

      // Pull off a leading label, e.g. "init: mov a, 1"
      while (true) {
        const labelMatch = line.match(/^([A-Za-z_.][A-Za-z_.0-9]*)\s*:\s*/);
        if (!labelMatch) break;
        items.push({ kind: 'label', name: labelMatch[1], lineno });
        line = line.slice(labelMatch[0].length).trim();
        if (!line) break;
      }
      if (!line) continue;

      // Directives
      if (line.startsWith('#')) {
        const dirMatch = line.match(/^#([A-Za-z_][A-Za-z_0-9]*)\b\s*(.*)$/);
        if (!dirMatch) continue;
        const name = dirMatch[1].toLowerCase();
        const rest = dirMatch[2].trim();
        if (name === 'addr') {
          items.push({ kind: 'addr', expr: rest, lineno });
        } else if (name === 'd' || name === 'd8' || name === 'str') {
          items.push({ kind: 'data', text: rest, lineno });
        } else if (name === 'bits' || name === 'outp') {
          // ignore — assume 8-bit, offset 0
        } else if (name === 'res' || name === 'reserve') {
          items.push({ kind: 'res', expr: rest, lineno });
        } else {
          // unknown directive — skip with a warning attached later
          items.push({ kind: 'unknown_dir', name, rest, lineno });
        }
        continue;
      }

      // Instruction: split mnemonic and operands
      const sp = line.search(/\s/);
      let mnem, rest;
      if (sp < 0) { mnem = line; rest = ''; }
      else { mnem = line.slice(0, sp); rest = line.slice(sp + 1).trim(); }
      if (!MNEMONICS.has(mnem.toLowerCase())) {
        items.push({ kind: 'error', msg: 'unknown mnemonic: ' + mnem, lineno });
        continue;
      }
      const ops = splitOperands(rest);
      const expanded = expandMacro(mnem, ops, lineno);
      if (expanded) {
        for (const e of expanded) items.push({ kind: 'instr', mnem: e.mnem, ops: e.ops, lineno: e.lineno });
      } else {
        items.push({ kind: 'instr', mnem, ops, lineno });
      }
    }
    return items;
  }

  // ─── Data directive ──────────────────────────────────────────────────
  // Parses #d operands into a list of bytes. Supports strings and numeric
  // expressions separated by commas. Strings allow simple \n, \0, \t, \r,
  // \\, \" escapes.
  function parseDataOperand(text, ctx) {
    const out = [];
    const parts = splitOperands(text);
    for (const p of parts) {
      const s = p.trim();
      if (!s) continue;
      if (s.startsWith('"') && s.endsWith('"')) {
        // string literal
        let i = 1;
        while (i < s.length - 1) {
          const c = s[i];
          if (c === '\\' && i + 1 < s.length - 1) {
            out.push(unescape(s[i + 1]));
            i += 2;
          } else {
            out.push(s.charCodeAt(i));
            i++;
          }
        }
      } else {
        out.push(evalExpr(s, ctx) & 0xFF);
      }
    }
    return out;
  }

  // Worst-case data size when we don't yet have labels: we can compute it
  // statically because strings/numbers don't depend on labels for *size*.
  function dataSize(text) {
    // Re-use parseDataOperand but stub the expression evaluator: we just need
    // to count outputs. The number of bytes equals number of items, treating
    // string contents as their visible length after unescaping.
    let count = 0;
    const parts = splitOperands(text);
    for (const p of parts) {
      const s = p.trim();
      if (!s) continue;
      if (s.startsWith('"') && s.endsWith('"')) {
        let i = 1;
        while (i < s.length - 1) {
          if (s[i] === '\\' && i + 1 < s.length - 1) { count++; i += 2; }
          else { count++; i++; }
        }
      } else {
        count++;
      }
    }
    return count;
  }

  // ─── Assembler entry point ───────────────────────────────────────────
  function assemble(source, options) {
    options = options || {};
    const startAddr = (options.startAddr != null) ? options.startAddr : 0;
    const errors = [];

    let items;
    try {
      items = preprocess(source);
    } catch (e) {
      return { ok: false, bytes: [], baseAddr: 0, errors: [{ msg: e.message, lineno: 0 }] };
    }

    // ── Pass 1: compute addresses + collect labels ───────────────────
    const labels = new Map();
    let addr = startAddr;
    let baseAddr = null;
    let parent = null;

    // First, look for the earliest #addr directive — that becomes baseAddr
    // unless overridden.
    for (const it of items) {
      if (it.kind === 'addr') {
        try { baseAddr = evalExpr(it.expr, { here: 0, labels: new Map(), parent: null }); }
        catch (_) { /* leave null, will error in pass 2 if needed */ }
        break;
      }
    }
    if (baseAddr == null) baseAddr = startAddr;
    addr = baseAddr;

    const sized = [];   // parallel to instr/data items, with computed size & addr

    for (const it of items) {
      if (it.kind === 'label') {
        if (it.name.startsWith('.')) {
          if (!parent) {
            errors.push({ lineno: it.lineno, msg: 'local label "' + it.name + '" has no parent' });
            continue;
          }
          labels.set(parent + it.name, addr & 0xFF);
        } else {
          parent = it.name;
          labels.set(it.name, addr & 0xFF);
        }
      } else if (it.kind === 'addr') {
        try {
          addr = evalExpr(it.expr, { here: addr & 0xFF, labels, parent }) & 0xFFFF;
        } catch (e) {
          errors.push({ lineno: it.lineno, msg: '#addr: ' + e.message });
        }
      } else if (it.kind === 'data') {
        const size = dataSize(it.text);
        sized.push({ item: it, addr: addr & 0xFF, size });
        addr += size;
      } else if (it.kind === 'res') {
        let n = 0;
        try { n = evalExpr(it.expr, { here: addr & 0xFF, labels, parent }) & 0xFFFF; }
        catch (e) { errors.push({ lineno: it.lineno, msg: '#res: ' + e.message }); }
        sized.push({ item: it, addr: addr & 0xFF, size: n });
        addr += n;
      } else if (it.kind === 'instr') {
        try {
          const plan = encodeInstr(it.mnem, it.ops, it.lineno);
          sized.push({ item: it, plan, addr: addr & 0xFF, size: plan.size });
          addr += plan.size;
        } catch (e) {
          errors.push({ lineno: it.lineno, msg: e.message.replace(/^line \d+: /, '') });
        }
      } else if (it.kind === 'error') {
        errors.push({ lineno: it.lineno, msg: it.msg });
      }
    }

    if (errors.length > 0) {
      return { ok: false, bytes: [], baseAddr, errors, labels };
    }

    // ── Pass 2: emit bytes ────────────────────────────────────────────
    // We assume contiguous emission from baseAddr; any #addr that moves us
    // backwards or non-contiguously will be flagged.
    const bytes = [];
    const listing = [];
    let cursor = baseAddr & 0xFF;
    parent = null;

    for (const it of items) {
      if (it.kind === 'label') {
        if (!it.name.startsWith('.')) parent = it.name;
        continue;
      }
      if (it.kind === 'addr') {
        let newAddr;
        try {
          newAddr = evalExpr(it.expr, { here: cursor, labels, parent }) & 0xFFFF;
        } catch (e) {
          errors.push({ lineno: it.lineno, msg: '#addr: ' + e.message });
          continue;
        }
        if (newAddr < cursor) {
          errors.push({ lineno: it.lineno, msg: '#addr moves backwards (' + cursor.toString(16) + ' -> ' + newAddr.toString(16) + ')' });
          continue;
        }
        while (cursor < newAddr) { bytes.push(0); cursor++; }
        continue;
      }
      if (it.kind === 'data') {
        try {
          const ds = parseDataOperand(it.text, { here: cursor, labels, parent });
          for (const b of ds) bytes.push(b & 0xFF);
          listing.push({ lineno: it.lineno, addr: cursor, bytes: ds, text: '#d ' + it.text });
          cursor += ds.length;
        } catch (e) {
          errors.push({ lineno: it.lineno, msg: '#d: ' + e.message });
        }
        continue;
      }
      if (it.kind === 'res') {
        let n;
        try { n = evalExpr(it.expr, { here: cursor, labels, parent }) & 0xFFFF; }
        catch (e) { errors.push({ lineno: it.lineno, msg: '#res: ' + e.message }); continue; }
        for (let i = 0; i < n; i++) bytes.push(0);
        cursor += n;
        continue;
      }
      if (it.kind === 'instr') {
        // Look up matching sized entry
        const s = sized.find(x => x.item === it);
        if (!s || !s.plan) continue;
        let emitted;
        try {
          emitted = s.plan.emit({ here: cursor, labels, parent });
        } catch (e) {
          errors.push({ lineno: it.lineno, msg: e.message });
          continue;
        }
        for (const b of emitted) bytes.push(b & 0xFF);
        listing.push({ lineno: it.lineno, addr: cursor, bytes: emitted, text: it.mnem + ' ' + (it.ops || []).join(', ') });
        cursor += emitted.length;
        continue;
      }
    }

    if (errors.length > 0) return { ok: false, bytes, baseAddr, errors, labels, listing };
    return { ok: true, bytes, baseAddr, errors: [], labels, listing };
  }

  // Heuristic: does this look like assembly source rather than raw hex?
  function looksLikeAsm(text) {
    // Strip comments first so "// 38 12" doesn't look like ASM.
    const stripped = text.split(/\r?\n/).map(stripComments).join('\n').trim();
    if (!stripped) return false;
    // Any directive or label or non-hex letters = ASM.
    if (/#[A-Za-z]/.test(stripped)) return true;
    if (/[A-Za-z_][A-Za-z_0-9]*\s*:/.test(stripped)) return true;
    // Any letter that isn't a hex digit indicates ASM.
    if (/[g-zG-Z]/.test(stripped)) return true;
    // Mnemonics that ARE all hex chars (e.g. "add", "bcd"): walk tokens.
    const toks = stripped.split(/[\s,]+/).filter(Boolean);
    for (const t of toks) {
      if (/^[0-9a-fA-F]{1,2}$/.test(t)) continue;
      if (/^0x[0-9a-fA-F]+$/.test(t)) return true;  // 0x.. is asm style
      return true; // any non-hex-byte token = asm
    }
    return false;
  }

  return { assemble, looksLikeAsm };
});
