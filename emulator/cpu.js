// LWCPU4 CPU core — shared between the Node CLI and the browser GUI.
// Works as a CommonJS module (Node) and as a global (browser <script>).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LWCPU4Module = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_TTY_SEGMENT = 0x40;

  // Flag bits in ST
  const FLAG_C = 0x01;
  const FLAG_Z = 0x02;
  const FLAG_N = 0x04;

  // The CPU has a single 16 KB RAM addressed by a 14-bit address:
  //   bits  [7:0]  = the byte-within-page address (from the instruction)
  //   bits [13:8]  = the page number, taken from the low 6 bits of CS or DS
  // Bits 6 and 7 of CS/DS are ignored, so every segment value aliases into
  // this RAM (e.g. DS 0x00, 0x40, 0x80, 0xC0 all see the same page). The
  // TTY at (ttySegment, 0) is the only memory access that bypasses the RAM.
  const RAM_PAGE_BITS = 6;
  const RAM_PAGES     = 1 << RAM_PAGE_BITS;   // 64
  const RAM_PAGE_MASK = RAM_PAGES - 1;        // 0x3F
  const RAM_SIZE      = RAM_PAGES * 256;      // 16384

  class LWCPU4 {
    constructor(options) {
      options = options || {};
      this.ttySegment = (options.ttySegment != null) ? (options.ttySegment & 0xFF) : DEFAULT_TTY_SEGMENT;
      this.ram = new Uint8Array(RAM_SIZE);
      this.ttyInputBuffer = [];       // bytes pending for TTY read
      this.ttyOutputCallback = null;  // function(byte) called on TTY write
      this.reset();
    }

    // The 14-bit RAM index for a given (segment, addr) pair.
    ramIndex(seg, addr) {
      return ((seg & RAM_PAGE_MASK) << 8) | (addr & 0xFF);
    }

    reset() {
      this.a = 0;
      this.b = 0;
      this.st = 0;
      this.pc = 0;
      this.cs = 0;
      this.ds = 0;
      this.condition = 0;
      this.halted = false;
      this.cycles = 0;
    }

    // Returns a 256-byte view of the page that `seg` resolves to. Mutating the
    // returned Uint8Array writes through to the underlying 16 KB RAM.
    getSegment(seg) {
      const off = (seg & RAM_PAGE_MASK) << 8;
      return this.ram.subarray(off, off + 256);
    }

    clearMemory() {
      this.ram.fill(0);
    }

    // Direct memory access (no side effects, no flag changes).
    peek(seg, addr) {
      return this.ram[this.ramIndex(seg, addr)];
    }

    poke(seg, addr, val) {
      this.ram[this.ramIndex(seg, addr)] = val & 0xFF;
    }

    // Memory access used by the CPU.
    // TTY read: if data available, clear C and return char; if empty, set C and return 0.
    // TTY write: send byte to ttyOutputCallback.
    readMem(seg, addr) {
      seg &= 0xFF;
      addr &= 0xFF;
      if (seg === this.ttySegment && addr === 0) {
        if (this.ttyInputBuffer.length > 0) {
          this.st &= ~FLAG_C;
          return this.ttyInputBuffer.shift() & 0xFF;
        }
        this.st |= FLAG_C;
        return 0;
      }
      return this.ram[this.ramIndex(seg, addr)];
    }

    writeMem(seg, addr, val) {
      seg &= 0xFF;
      addr &= 0xFF;
      val &= 0xFF;
      if (seg === this.ttySegment && addr === 0) {
        if (this.ttyOutputCallback) this.ttyOutputCallback(val);
        return;
      }
      this.ram[this.ramIndex(seg, addr)] = val;
    }

    // Load `data` into `segment` starting at `offset`. If the data overflows
    // 256 bytes, the rest wraps into segment+1, +2, …, wrapping the 14-bit
    // RAM index at 0x4000.
    loadProgram(data, segment, offset) {
      offset = (offset || 0) & 0xFF;
      let idx = this.ramIndex(segment || 0, offset);
      for (let i = 0; i < data.length; i++) {
        this.ram[idx % RAM_SIZE] = data[i] & 0xFF;
        idx++;
      }
    }

    fetch() {
      const addr = this.pc & 0xFF;
      // The first 16 bytes of every code segment are mapped to segment 0
      // (the bootloader ROM area) by the hardware.
      const seg = (addr < 0x10) ? 0 : this.cs;
      const val = this.getSegment(seg)[addr];
      this.pc = (this.pc + 1) & 0xFF;
      return val;
    }

    getReg(code) {
      switch (code) {
        case 1: return this.a;
        case 2: return this.b;
        case 3: return this.st;
        default: return 0;
      }
    }

    setReg(code, val) {
      val &= 0xFF;
      switch (code) {
        case 1: this.a = val; break;
        case 2: this.b = val; break;
        case 3: this.st = val; break;
      }
    }

    // Update flags. `logical` ops (and/or/xor, loads) preserve C and only
    // touch Z and N. Arithmetic updates C, Z, N.
    updateFlags(result, logical) {
      if (!logical) {
        if (result & 0x100) this.st |= FLAG_C;
        else this.st &= ~FLAG_C;
      }
      if ((result & 0xFF) === 0) this.st |= FLAG_Z;
      else this.st &= ~FLAG_Z;
      if (result & 0x80) this.st |= FLAG_N;
      else this.st &= ~FLAG_N;
    }

    checkCondition() {
      const c = this.condition;
      const negate = (c & 0x8) !== 0;
      const mask = c & 0x7;
      let result = (this.st & mask) !== 0;
      if (negate) result = !result;
      return result;
    }

    step() {
      if (this.halted) return false;

      const byte0 = this.fetch();
      const hi = (byte0 >> 4) & 0xF;
      const lo = byte0 & 0xF;
      const r1 = (lo >> 2) & 3;
      const r2 = lo & 3;

      switch (hi) {
        case 0x0:
          if (r1 !== 0) this.setReg(r1, this.pc);
          // r1 == 0 -> nop
          break;

        case 0x1: { // jmp / jif
          const isJif = (r2 & 1) === 1;
          if (r1 === 0) {
            const addr = this.fetch();
            if (!isJif || this.checkCondition()) this.pc = addr;
          } else {
            if (!isJif || this.checkCondition()) this.pc = this.getReg(r1);
          }
          break;
        }

        case 0x2:
          this.condition = lo;
          break;

        case 0x3:
          if (r2 === 0 && r1 !== 0) {
            this.setReg(r1, this.fetch());
          } else if (r1 !== 0 && r2 !== 0) {
            this.setReg(r1, this.getReg(r2));
          }
          break;

        case 0x4: { // load
          const addr = (r2 === 0) ? this.fetch() : this.getReg(r2);
          const val = this.readMem(this.ds, addr);
          this.setReg(r1, val);
          this.updateFlags(val, true); // preserves C set/cleared by readMem
          break;
        }

        case 0x5: { // store
          if (r2 === 0) {
            this.writeMem(this.ds, this.fetch(), this.getReg(r1));
          } else if (r1 === 0) {
            // mov [reg], imm8
            this.writeMem(this.ds, this.getReg(r2), this.fetch());
          } else {
            this.writeMem(this.ds, this.getReg(r2), this.getReg(r1));
          }
          break;
        }

        case 0x6: // segment ops
          if (r1 === 0) {
            const num = this.fetch();
            if (r2 === 0) this.cs = num;
            else if (r2 === 1) this.ds = num;
          } else {
            if (r2 === 0) this.cs = this.getReg(r1);
            else if (r2 === 1) this.ds = this.getReg(r1);
          }
          break;

        case 0x7: case 0x8: case 0x9: case 0xA:
        case 0xB: case 0xC: case 0xD: case 0xE:
          this.execALU(hi, r1, r2);
          break;

        case 0xF:
          this.execShift(r1, r2);
          break;
      }

      this.cycles++;
      return true;
    }

    execALU(op, r1, r2) {
      let a, b, destReg;

      if (r1 !== 0 && r2 !== 0) {
        a = this.getReg(r1);
        b = this.getReg(r2);
        destReg = r1;
      } else if (r1 !== 0) {
        a = this.getReg(r1);
        b = this.fetch();
        destReg = r1;
      } else {
        a = this.fetch();
        b = this.getReg(r2);
        destReg = r2;
      }

      const carry = (this.st & FLAG_C) ? 1 : 0;
      let result;
      let logical = false;

      switch (op) {
        case 0x7: result = a + b; break;
        case 0x8: result = a + b + carry; break;
        case 0x9: result = a + (~b & 0xFF) + 1; break;
        case 0xA: result = a + (~b & 0xFF) + carry; break;
        case 0xB: result = a + (~b & 0xFF) + 1; break;
        case 0xC: result = a & b; logical = true; break;
        case 0xD: result = a | b; logical = true; break;
        case 0xE: result = a ^ b; logical = true; break;
      }

      // For an `and st, imm` that explicitly clears the carry bit, the result
      // is written to ST below. If we then ran updateFlags(result, logical=true)
      // it would set Z/N based on the new ST value but preserve C — meaning the
      // carry the user just cleared via AND would be wiped by the *previous* C
      // value still in ST. To honour `and st, 0xfe`-style code, update flags
      // FIRST (preserving C), then for op writing to ST, leave ST as the AND
      // result so the explicit bit manipulation wins.
      if (op === 0xB) {
        // cmp: flags only
        this.updateFlags(result, logical);
      } else if (destReg === 3 && logical) {
        // Logical write to ST: the explicit bits win. Compute Z/N from
        // result and merge into the bits the user wanted in ST.
        let finalST = result & 0xFF;
        if ((result & 0xFF) === 0) finalST |= FLAG_Z; else finalST &= ~FLAG_Z;
        if (result & 0x80) finalST |= FLAG_N; else finalST &= ~FLAG_N;
        this.st = finalST & 0xFF;
      } else {
        this.setReg(destReg, result & 0xFF);
        this.updateFlags(result, logical);
      }
    }

    execShift(r1, mode) {
      if (r1 === 0) return;
      let val = this.getReg(r1);
      let carryOut = 0;

      switch (mode) {
        case 0: // shr
          carryOut = val & 1;
          val = (val >> 1) & 0x7F;
          break;
        case 1: // ror
          carryOut = val & 1;
          val = ((val >> 1) | (carryOut << 7)) & 0xFF;
          break;
        case 2: // asr
          carryOut = val & 1;
          val = ((val >> 1) | (val & 0x80)) & 0xFF;
          break;
        default:
          return;
      }

      this.setReg(r1, val);
      if (carryOut) this.st |= FLAG_C; else this.st &= ~FLAG_C;
      if (val === 0) this.st |= FLAG_Z; else this.st &= ~FLAG_Z;
      if (val & 0x80) this.st |= FLAG_N; else this.st &= ~FLAG_N;
    }
  }

  // ─── Disassembler ──────────────────────────────────────────────────

  const REG_NAMES  = { 0: '?', 1: 'a', 2: 'b', 3: 'ST' };
  const COND_NAMES = { 0x1: 'C', 0x2: 'Z', 0x4: 'N', 0x9: 'NC', 0xA: 'NZ', 0xC: 'NN' };
  const SEG_NAMES  = { 0: 'cs', 1: 'ds' };
  const ALU_NAMES  = { 0x7: 'add', 0x8: 'adc', 0x9: 'sub', 0xA: 'sbc',
                       0xB: 'cmp', 0xC: 'and', 0xD: 'or',  0xE: 'xor' };
  const SHIFT_NAMES = { 0: 'shr', 1: 'ror', 2: 'asr' };

  function hex2(v) { return (v & 0xFF).toString(16).padStart(2, '0'); }
  function hex4(v) { return (v & 0xFFFF).toString(16).padStart(4, '0'); }

  // Disassemble a single instruction from `readByte(addr)`, starting at `addr`.
  // Returns { mnemonic, operands, bytes, length }.
  function disassemble(readByte, addr) {
    let pc = addr & 0xFF;
    const start = pc;
    const rd = () => { const v = readByte(pc & 0xFF); pc = (pc + 1) & 0xFF; return v; };

    const byte0 = rd();
    const hi = (byte0 >> 4) & 0xF;
    const lo = byte0 & 0xF;
    const r1 = (lo >> 2) & 3;
    const r2 = lo & 3;
    let mnemonic = '???', operands = '';

    switch (hi) {
      case 0x0:
        if (r1 === 0) mnemonic = 'nop';
        else { mnemonic = 'spc'; operands = REG_NAMES[r1]; }
        break;
      case 0x1: {
        const isJif = (r2 & 1) === 1;
        mnemonic = isJif ? 'jif' : 'jmp';
        operands = (r1 === 0) ? '$' + hex2(rd()) : REG_NAMES[r1];
        break;
      }
      case 0x2:
        mnemonic = 'scd';
        operands = COND_NAMES[lo] || ('0x' + lo.toString(16));
        break;
      case 0x3:
        mnemonic = 'mov';
        if (r2 === 0 && r1 !== 0) operands = REG_NAMES[r1] + ', 0x' + hex2(rd());
        else operands = REG_NAMES[r1] + ', ' + REG_NAMES[r2];
        break;
      case 0x4:
        mnemonic = 'mov';
        operands = (r2 === 0)
          ? REG_NAMES[r1] + ', [0x' + hex2(rd()) + ']'
          : REG_NAMES[r1] + ', [' + REG_NAMES[r2] + ']';
        break;
      case 0x5:
        mnemonic = 'mov';
        if (r2 === 0) {
          operands = '[0x' + hex2(rd()) + '], ' + REG_NAMES[r1];
        } else if (r1 === 0) {
          operands = '[' + REG_NAMES[r2] + '], 0x' + hex2(rd());
        } else {
          operands = '[' + REG_NAMES[r2] + '], ' + REG_NAMES[r1];
        }
        break;
      case 0x6:
        mnemonic = 'mov';
        if (r1 === 0) {
          operands = (SEG_NAMES[r2] || '?') + ', 0x' + hex2(rd());
        } else {
          operands = (SEG_NAMES[r2] || '?') + ', ' + REG_NAMES[r1];
        }
        break;
      case 0x7: case 0x8: case 0x9: case 0xA:
      case 0xB: case 0xC: case 0xD: case 0xE:
        mnemonic = ALU_NAMES[hi];
        if (r1 !== 0 && r2 !== 0) operands = REG_NAMES[r1] + ', ' + REG_NAMES[r2];
        else if (r1 !== 0)        operands = REG_NAMES[r1] + ', 0x' + hex2(rd());
        else                       operands = '0x' + hex2(rd()) + ', ' + REG_NAMES[r2];
        break;
      case 0xF:
        mnemonic = SHIFT_NAMES[r2] || '???';
        operands = REG_NAMES[r1];
        break;
    }

    const length = ((pc - start) + 256) % 256 || 1;
    const bytes = [];
    for (let i = 0; i < length; i++) bytes.push(readByte((start + i) & 0xFF));
    return { mnemonic, operands, bytes, length };
  }

  return {
    LWCPU4,
    disassemble,
    hex2,
    hex4,
    FLAG_C, FLAG_Z, FLAG_N,
    RAM_PAGE_BITS, RAM_PAGES, RAM_PAGE_MASK, RAM_SIZE,
    REG_NAMES, COND_NAMES, SEG_NAMES, ALU_NAMES, SHIFT_NAMES
  };
});
