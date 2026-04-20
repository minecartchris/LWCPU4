# LWCPU4 - 8-bit CPU Documentation

A custom 8-bit CPU designed in Logic World, with emulators for web and CLI.

## Architecture

### Registers
- **A** - Primary accumulator register
- **B** - Secondary register
- **ST** - Status register (flags)

### Status Flags (ST)
| Bit | Flag | Description |
|-----|------|-------------|
| 0 | C | Carry flag |
| 1 | Z | Zero flag |
| 2 | N | Negative flag |

### Segments
- **CS** - Code Segment
- **DS** - Data Segment
- **PC** - Program Counter

### Special Addresses
- **TTY (0x40:0)** - Terminal output (segment 0x40, address 0)
- **Bootloader (0x00)** - Boot code loads at address 0
- **Program (0x10)** - User program loads at address 0x10

## Instruction Set

### Encoding
Each instruction is 1-3 bytes. The first byte contains:
- High nibble (bits 7-4): OpCode
- Low nibble (bits 3-0): Register fields (r1, r2)

Register encoding:
- 0b01 = A
- 0b10 = B
- 0b11 = ST

### Instructions

#### 0x0: SPC - Special
`spc reg` - Load PC into register

#### 0x1: JMP/JIF - Jump
`jmp addr` - Unconditional jump to address
`jmp reg` - Jump to address in register
`jif addr` - Jump if condition met
`jif reg` - Jump to address in register if condition met

#### 0x2: SCD - Set Condition
`scd c` - Set condition flags
- c = condition code

Conditions:
- 0b0001 = c (carry)
- 0b0010 = z (zero)
- 0b0100 = n (negative)
- 0b1001 = nc (not carry)
- 0b1010 = nz (not zero)
- 0b1100 = nn (not negative)

#### 0x3: MOV - Move/Load
`mov reg, data` - Load immediate value
`mov reg1, reg2` - Copy register to register
`mov reg, [addr]` - Load from memory (address)
`mov reg, [reg]` - Load from memory (address in register)

#### 0x4: MOV - Load from Memory
`mov reg, [addr]` - Load from memory (DS:addr)
`mov reg, [reg]` - Load from memory (DS:reg)

#### 0x5: MOV - Store to Memory
`mov [addr], reg` - Store to memory (DS:addr)
`mov [reg], reg` - Store to memory (DS:reg)
`mov [reg], data` - Store immediate to memory

#### 0x6: SEG - Segment Operations
`mov cs, num` - Set code segment
`mov ds, num` - Set data segment
`mov cs, reg` - Set CS from register
`mov ds, reg` - Set DS from register

#### 0x7: ADD - Add
`add reg1, reg2` - reg1 = reg1 + reg2
`add reg, data` - reg = reg + immediate

#### 0x8: ADC - Add with Carry
`adc reg1, reg2` - Add with carry
`adc reg, data` - Add immediate with carry

#### 0x9: SUB - Subtract
`sub reg1, reg2` - reg1 = reg1 - reg2
`sub reg, data` - reg = reg - immediate

#### 0xA: SBC - Subtract with Carry
`sbc reg1, reg2` - Subtract with borrow
`sbc reg, data` - Subtract immediate with borrow

#### 0xB: CMP - Compare
`cmp reg1, reg2` - Compare (sets flags, discards result)
`cmp reg, data` - Compare immediate

#### 0xC: AND - Logical AND
`and reg1, reg2` - reg1 = reg1 AND reg2
`and reg, data` - reg = reg AND immediate

#### 0xD: OR - Logical OR
`or reg1, reg2` - reg1 = reg1 OR reg2
`or reg, data` - reg = reg OR immediate

#### 0xE: XOR - Logical XOR
`xor reg1, reg2` - reg1 = reg1 XOR reg2
`xor reg, data` - reg = reg XOR immediate

#### 0xF: Shift/Rotate
`shr reg` - Shift right logical
`ror reg` - Rotate right
`asr reg` - Arithmetic shift right

### Macro Instructions

```asm
; Shift left ( via add )
shl reg          ; reg = reg + reg

; Rotate left
rol reg         ; adc reg, reg

; Branch instructions
bcs addr        ; Branch on carry set
bcc addr        ; Branch on carry clear
beq addr       ; Branch on equal (zero)
bne addr       ; Branch on not equal
bmi addr       ; Branch on negative
bpl addr       ; Branch on positive
```

## Assembly Syntax

```asm
; Comments start with ;
    nop             ; No operation
    mov a, 10       ; Load 10 into A
    mov b, a         ; Copy A to B
    add a, b         ; Add B to A
    jmp 0x20        ; Jump to 0x20
    jif 0x20        ; Jump if condition met
    scd z           ; Set zero condition
```

## Memory Map

| Segment | Use |
|---------|-----|
| 0x00 | Bootloader |
| 0x10 | User Program |
| 0x40 | TTY (Terminal) |

## Emulators

### Web Emulator
Located at `emulators/index.html`

Features:
- Real-time execution display
- Register visualization
- Memory viewer
- TTY output

### CLI Emulator
Located at `emulators/cli.js`

Usage:
```bash
node emulators/cli.js [boot.bin] [program.bin] [-l addr] [-b]
```

Options:
- `-l, --load-addr addr` - Load address (default: 0x10)
- `-b, --bootloader` - Load bootloader

Controls:
- SPACE - Run/Pause
- R - Reset
- T - Toggle speed
- Q - Quit

## Building

### Assemble
```bash
customasm.exe input.asm -o output.bin
```

### Run CLI Emulator
```bash
node emulators/cli.js bin/boot.bin bin/output2.bin -l 0
```

## Files

### Source Files
- `LWCPU4.asm` - Instruction definitions
- `lwSub/` - Logic World component files

### Examples
- `examples/hello.asm` - Hello world
- `examples/stringInput.asm` - String input demo
- `examples/phoneTest.asm` - Phone test program

### Emulators
- `emulators/index.html` - Web emulator
- `emulators/cli.js` - CLI emulator

## Hardware

The CPU is built in Logic World using:
- MHG components (gates, relays, latches)
- CheeseUtilMod RAM component
- Custom PCB design

See `lwSub/` directory for the Logic World component files.