#!/usr/bin/env node
// LWCPU4 Node CLI emulator.
//
// Usage:
//   node emulator/cli.js [options] <file>[@addr][:seg] [<file2>[@addr][:seg] ...]
//
// Each <file> is loaded as a raw binary. Default load address is 0x00 of
// segment 0; @addr and :seg override per file.
//
// Options:
//   --tty=<seg>      TTY segment (hex/decimal). Default 0x40.
//   --pc=<addr>      Initial PC. Default 0x00.
//   --cs=<seg>       Initial CS. Default 0x00.
//   --ds=<seg>       Initial DS. Default 0x00.
//   --speed=<hz>     Throttle CPU to N Hz. Default: unlimited.
//   --max=<cycles>   Stop after N cycles. Default: unlimited.
//   --debug          Print disassembly of every executed instruction to stderr.
//   --trace=<n>      Print first N instructions then run silently.
//   --no-input       Don't capture keystrokes (good for piping stdin).
//   -h, --help       Show this help.

const fs = require('fs');
const path = require('path');
const { LWCPU4, disassemble, hex2 } = require('./cpu.js');

function parseInt0(s) {
  if (typeof s !== 'string') return NaN;
  s = s.trim();
  if (s.startsWith('0x') || s.startsWith('0X')) return parseInt(s.slice(2), 16);
  if (s.startsWith('0b') || s.startsWith('0B')) return parseInt(s.slice(2), 2);
  return parseInt(s, 10);
}

function printHelp() {
  process.stdout.write(
`LWCPU4 CLI emulator

Usage:
  node emulator/cli.js [options] <file>[@addr][:seg] [<file2>[@addr][:seg] ...]

Examples:
  node emulator/cli.js bin/hello.bin
  node emulator/cli.js bin/boot.bin bin/linux.bin@0x10
  node emulator/cli.js --speed=100 bin/output2.bin
  node emulator/cli.js --debug --max=200 bin/hello.bin

Options:
  --tty=<seg>     TTY segment (default 0x40)
  --pc=<addr>     Initial PC (default 0)
  --cs=<seg>      Initial CS (default 0)
  --ds=<seg>      Initial DS (default 0)
  --speed=<hz>    Throttle to N Hz (default: unlimited)
  --max=<cycles>  Stop after N cycles
  --debug         Print every instruction as it runs
  --trace=<n>     Print only the first N instructions
  --no-input      Disable raw-mode keyboard capture
  -h, --help      Show this help

Controls during run:
  Type           Sends characters to TTY input
  Enter          Sends 0x0A (LF)
  Backspace      Sends 0x08 (BS)
  Ctrl+C         Quit
`);
}

function parseArgs(argv) {
  const opts = {
    files: [],          // { path, addr, seg }
    ttySegment: 0x40,
    pc: 0, cs: 0, ds: 0,
    speed: 0,           // 0 = unlimited
    maxCycles: 0,       // 0 = unlimited
    debug: false,
    trace: 0,
    input: true,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') opts.help = true;
    else if (a === '--debug') opts.debug = true;
    else if (a === '--no-input') opts.input = false;
    else if (a.startsWith('--tty='))   opts.ttySegment = parseInt0(a.slice(6));
    else if (a.startsWith('--pc='))    opts.pc        = parseInt0(a.slice(5));
    else if (a.startsWith('--cs='))    opts.cs        = parseInt0(a.slice(5));
    else if (a.startsWith('--ds='))    opts.ds        = parseInt0(a.slice(5));
    else if (a.startsWith('--speed=')) opts.speed     = parseInt0(a.slice(8));
    else if (a.startsWith('--max='))   opts.maxCycles = parseInt0(a.slice(6));
    else if (a.startsWith('--trace=')) opts.trace     = parseInt0(a.slice(8));
    else if (a.startsWith('--')) {
      console.error('Unknown option: ' + a);
      process.exit(2);
    } else {
      // <file>[@addr][:seg]
      let p = a, addr = 0, seg = 0;
      const colonIdx = p.lastIndexOf(':');
      const atIdx = p.lastIndexOf('@');
      // ":seg" must come after "@addr". Be careful with Windows paths like C:\
      // — accept ":seg" only when it follows "@addr" or there's no colon at
      // all in the path before the @.
      if (colonIdx > atIdx && atIdx !== -1) {
        seg = parseInt0(p.slice(colonIdx + 1));
        p = p.slice(0, colonIdx);
      }
      if (atIdx !== -1 && (colonIdx <= atIdx)) {
        // re-find atIdx in case path was sliced above
        const at = p.lastIndexOf('@');
        if (at !== -1) {
          addr = parseInt0(p.slice(at + 1));
          p = p.slice(0, at);
        }
      }
      opts.files.push({ path: p, addr: addr & 0xFF, seg: seg & 0xFF });
    }
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help || opts.files.length === 0) {
    printHelp();
    process.exit(opts.help ? 0 : 1);
  }

  const cpu = new LWCPU4({ ttySegment: opts.ttySegment });
  cpu.pc = opts.pc & 0xFF;
  cpu.cs = opts.cs & 0xFF;
  cpu.ds = opts.ds & 0xFF;

  for (const f of opts.files) {
    let bytes;
    try {
      bytes = fs.readFileSync(f.path);
    } catch (e) {
      console.error('Cannot read ' + f.path + ': ' + e.message);
      process.exit(1);
    }
    cpu.loadProgram(bytes, f.seg, f.addr);
    console.error('Loaded ' + bytes.length + ' bytes from ' +
      path.basename(f.path) + ' @ 0x' + hex2(f.addr) + ':0x' + hex2(f.seg));
  }

  // TTY output: write byte to stdout. Handle control chars sensibly.
  cpu.ttyOutputCallback = (b) => {
    if (b === 0x08) {
      // Backspace: erase last char visually.
      process.stdout.write('\b \b');
    } else if (b === 0x0D || b === 0x0A || (b >= 0x20 && b < 0x7F)) {
      process.stdout.write(Buffer.from([b]));
    } else if (b === 0x09) {
      process.stdout.write('\t');
    } else {
      // Non-printable: show as <HH>
      process.stdout.write('<' + hex2(b) + '>');
    }
  };

  // TTY input: capture keystrokes in raw mode.
  // Important: do NOT call process.stdin.setEncoding() — passing null/undefined
  // is silently coerced to 'utf8', which turns `data` events into strings and
  // breaks the bytewise iteration below (every char would read back as 0x00).
  let rawSetup = false;
  if (opts.input && process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    rawSetup = true;
    process.stdin.on('data', (chunk) => {
      // Defensive: if some upstream code set an encoding, chunk is a string.
      if (typeof chunk === 'string') chunk = Buffer.from(chunk, 'binary');
      for (let i = 0; i < chunk.length; i++) {
        const byte = chunk[i] & 0xFF;
        if (byte === 0x03) { // Ctrl-C
          cleanup();
          process.stdout.write('\n');
          process.exit(0);
        }
        // Filter null bytes — Windows raw-mode stdin sometimes emits 0x00 for
        // non-character key events (modifiers, focus changes, etc.).
        if (byte === 0x00) continue;
        if (byte === 0x7F) { // DEL -> map to BS (0x08)
          cpu.ttyInputBuffer.push(0x08);
        } else if (byte === 0x0D) { // CR -> LF
          cpu.ttyInputBuffer.push(0x0A);
        } else {
          cpu.ttyInputBuffer.push(byte);
        }
      }
    });
  }

  function cleanup() {
    if (rawSetup) {
      try {
        process.stdin.setRawMode(false);
        process.stdin.pause();
      } catch (_) { /* ignore */ }
    }
  }

  process.on('SIGINT', () => {
    cleanup();
    process.stdout.write('\n');
    process.exit(0);
  });

  // ── Run loop ───────────────────────────────────────────────────────
  const debug = opts.debug || opts.trace > 0;
  const traceLimit = opts.trace > 0 ? opts.trace : Infinity;
  const maxCycles = opts.maxCycles > 0 ? opts.maxCycles : Infinity;

  function dumpInstr() {
    const seg0 = cpu.getSegment(0);
    const segCS = cpu.getSegment(cpu.cs);
    const readByte = (a) => (a < 0x10) ? seg0[a] : segCS[a];
    const info = disassemble(readByte, cpu.pc);
    const hex = info.bytes.map(hex2).join(' ');
    const line = '  ' + hex2(cpu.cs) + ':' + hex2(cpu.pc) +
                 '  ' + hex.padEnd(8) +
                 '  ' + info.mnemonic.padEnd(4) + ' ' + info.operands +
                 '   ; A=' + hex2(cpu.a) + ' B=' + hex2(cpu.b) +
                 ' ST=' + hex2(cpu.st);
    process.stderr.write(line + '\n');
  }

  // Speed handling. For "unlimited", drain via setImmediate in batches; for
  // throttled, use a setInterval-ish loop. Use setImmediate for both to keep
  // the I/O loop responsive.
  let stopped = false;
  let lastTickMs = Date.now();
  let cyclesThisTick = 0;
  const BATCH = 5000;

  function tick() {
    if (stopped) return;

    if (opts.speed > 0) {
      // Throttled mode: run roughly speed/60 cycles per ~16ms tick.
      const now = Date.now();
      const dt = now - lastTickMs;
      const allowed = Math.max(1, Math.floor(opts.speed * dt / 1000));
      let n = 0;
      while (n < allowed && !cpu.halted && cpu.cycles < maxCycles) {
        if (debug && cpu.cycles < traceLimit) dumpInstr();
        cpu.step();
        n++;
      }
      lastTickMs = now;
      if (cpu.halted || cpu.cycles >= maxCycles) return finish();
      setTimeout(tick, 16);
    } else {
      // Unlimited mode: run a batch, yield to I/O loop.
      let n = 0;
      while (n < BATCH && !cpu.halted && cpu.cycles < maxCycles) {
        if (debug && cpu.cycles < traceLimit) dumpInstr();
        cpu.step();
        n++;
      }
      if (cpu.halted || cpu.cycles >= maxCycles) return finish();
      setImmediate(tick);
    }
  }

  function finish() {
    stopped = true;
    cleanup();
    process.stdout.write('\n');
    process.stderr.write('--- CPU halted after ' + cpu.cycles + ' cycles ---\n');
    process.stderr.write('   A=' + hex2(cpu.a) + ' B=' + hex2(cpu.b) +
                         ' ST=' + hex2(cpu.st) +
                         ' PC=' + hex2(cpu.pc) +
                         ' CS=' + hex2(cpu.cs) +
                         ' DS=' + hex2(cpu.ds) + '\n');
    process.exit(0);
  }

  tick();
}

main();
