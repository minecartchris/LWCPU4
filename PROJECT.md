# LWCPU4 Project Documentation

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Instruction Set](#3-instruction-set)
4. [Assembly Language](#4-assembly-language)
5. [Memory Map](#5-memory-map)
6. [Hardware Implementation](#6-hardware-implementation)
7. [Software & Tools](#7-software--tools)
8. [Programming Guide](#8-programming-guide)
9. [Examples](#9-examples)
10. [Technical Reference](#10-technical-reference)

---

## 1. Overview

### 1.1 Project Introduction

LWCPU4 is a custom 8-bit CPU designed and implemented using the Logic World game. It features a von Neumann architecture with segmented memory, accumulator-based instruction set, and integrated terminal I/O capabilities.

**Project Details:**
- **Type:** 8-bit Accumulator CPU
- **Designer:** Custom design in Logic World
- **Word Size:** 8 bits
- **Address Space:** 256 bytes per segment × 256 segments
- **Assembly:** CustomASM syntax

### 1.2 Key Features

- Two general-purpose registers (A, B)
- Status register with carry, zero, and negative flags
- Segmented memory architecture (Code Segment, Data Segment)
- Integrated TTY (terminal) support at segment 0x40
- Conditional jump instructions
- Full arithmetic operations (add, subtract, compare)
- Logical operations (AND, OR, XOR)
- Shift and rotate operations

### 1.3 Development Tools

- **Assembler:** CustomASM (customasm.exe)
- **Emulators:** Web-based (index.html), CLI (emulators/cli.js)
- **Hardware Design:** Logic World with MHG component library

---

## 2. Architecture

### 2.1 CPU Registers

| Register | Name | Description |
|----------|------|------------|
| A | Accumulator | Primary register for arithmetic and logic operations |
| B | Secondary | Secondary register for operations and data |
| ST | Status | Flags register (C, Z, N) |
| PC | Program Counter | Current instruction address |
| CS | Code Segment | Current code segment |
| DS | Data Segment | Current data segment |

### 2.2 Status Register (ST)

The status register contains three flags:

| Bit | Flag | Name | Description |
|-----|------|------|-------------|
| 0 | C | Carry | Set when arithmetic operation generates carry |
| 1 | Z | Zero | Set when result is zero |
| 2 | N | Negative | Set when result is negative (bit 7 set) |

### 2.3 Register Encoding

| Register | Binary | Hex |
|----------|--------|-----|
| A | 0b01 | 0x1 |
| B | 0b10 | 0x2 |
| ST | 0b11 | 0x3 |

### 2.4 Segment Registers

| Segment | Use |
|---------|-----|
| CS | Code Segment - where instructions are fetched |
| DS | Data Segment - for memory operations |

### 2.5 Special Addresses

| Address | Use |
|---------|-----|
| 0x00 | Bootloader code |
| 0x10 | User program start |
| 0x40:0 | TTY output (segment 0x40, address 0) |

### 2.6 Data Flow

```
┌─────────────────────────────────────────────────────┐
│                    CPU Core                       │
│  ┌─────┐    ┌─────┐    ┌──────┐    ┌─────────┐   │
│  │  A  │◄───►│  B  │    │  ST   │    │   PC    │   │
│  └─────┘    └─────┘    └──────┘    └─────────┘   │
│     │          │           │             │           │
│     └──────────┴──────────┴──────────┘           │
│                    │                           │
│    ┌───────────────▼─────────────���─┐            │
│    │        ALU / Logic           │            │
│    └─────────────────────────────┘            │
│                    │                           │
│    ┌───────────────▼───────────────┐            │
│    │      Memory Interface         │            │
│    │  ┌─────────┐  ┌──────────┐   │            │
│    │  │   CS    │  │    DS    │   │            │
│    │  └─────────┘  └──────────┘   │            │
│    └─────────────────────────────┘            │
└─────────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌───────────────┐     ┌───────────────┐
│ Code Memory  │     │ Data Memory  │
│  (256 bytes) │     │  (256 bytes) │
└───────────────┘     └───────────────┘
        │                       │
        │               ┌───────┴───────┐
        │               ▼               ▼
        │         ┌─────────┐   ┌─────────┐
        │         │  RAM   │   │   TTY   │
        │         └─────────┘   └─────────┘
        │               Seg 0x40
        ▼
┌───────────────┐
│ Instructions │
└───────────────┘
```

---

## 3. Instruction Set

### 3.1 Instruction Encoding

All instructions are 1-3 bytes. The first byte contains:

```
 Byte 0:  [ opcode (4 bits) | r1 (2 bits) | r2 (2 bits) ]
```

**High nibble (bits 7-4):** OpCode (0x0 - 0xF)
**Low nibble (bits 3-0):** Register fields
- Bits 3-2: Register 1 (r1)
- Bits 1-0: Register 2 (r2)

### 3.2 OpCode Summary

| OpCode | Mnemonic | Type | Bytes | Description |
|-------|----------|------|-------|------------|
| 0x0 | SPC | Special | 1 | Set PC to register |
| 0x1 | JMP/JIF | Jump | 2 | Conditional jump |
| 0x2 | SCD | Control | 1 | Set condition |
| 0x3 | MOV | Move | 2-3 | Load/register move |
| 0x4 | MOV | Load | 2-3 | Load from memory |
| 0x5 | MOV | Store | 2-3 | Store to memory |
| 0x6 | SEG | Segment | 2 | Segment operations |
| 0x7 | ADD | Arithmetic | 2-3 | Addition |
| 0x8 | ADC | Arithmetic | 2-3 | Add with carry |
| 0x9 | SUB | Arithmetic | 2-3 | Subtraction |
| 0xA | SBC | Arithmetic | 2-3 | Subtract with carry |
| 0xB | CMP | Compare | 2-3 | Compare (flags only) |
| 0xC | AND | Logic | 2-3 | Logical AND |
| 0xD | OR | Logic | 2-3 | Logical OR |
| 0xE | XOR | Logic | 2-3 | Logical XOR |
| 0xF | SHR/ROR/ASR | Shift | 1 | Shift/Rotate |

### 3.3 Detailed Instructions

#### 0x0 - SPC (Set PC to Register)

```
Encoding:  0x0 r1 00
Syntax:    spc reg
Example:  spc a    ; Load PC into A
```

Copies the program counter value into the specified register.

#### 0x1 - JMP / JIF (Jump)

```
Unconditional:
  Encoding:  0x1   00   addr
  Syntax:    jmp addr
  Example:  jmp 0x20

Register:
  Encoding:  0x1   r1   00
  Syntax:    jmp reg
  Example:  jmp a

Conditional:
  Encoding:  0x1   r1   01   addr
  Syntax:    jif addr
  Example:  jif 0x20
```

JMP - Unconditional jump to address.
JIF - Jump if condition (set by SCD) is true.

#### 0x2 - SCD (Set Condition)

```
Encoding:  0x2   cond
Syntax:    scd cond
Example:  scd z
```

Sets the condition flags for conditional jumps.

| Condition | Code | Description |
|-----------|------|-------------|
| c | 0b0001 | Carry set |
| z | 0b0010 | Zero set |
| n | 0b0100 | Negative set |
| nc | 0b1001 | Not carry |
| nz | 0b1010 | Not zero |
| nn | 0b1100 | Not negative |

#### 0x3 - MOV (Register/Move)

```
Immediate:
  Encoding:  0x3   r1   00   data
  Syntax:    mov reg, data
  Example:  mov a, 10

Register to Register:
  Encoding:  0x3   r1   r2
  Syntax:    mov reg1, reg2
  Example:  mov a, b
```

#### 0x4 - MOV (Load from Memory)

```
From Address:
  Encoding:  0x4   r1   00   addr
  Syntax:    mov reg, [addr]
  Example:  mov a, [0x10]

From Register:
  Encoding:  0x4   r1   r2
  Syntax:    mov reg, [reg]
  Example:  mov a, [b]
```

Loads a value from memory (at DS segment) into register. Updates ST flags.

#### 0x5 - MOV (Store to Memory)

```
To Address:
  Encoding:  0x5   r1   00   addr
  Syntax:    mov [addr], reg
  Example:  mov [0x10], a

To Register Address:
  Encoding:  0x5   r1   r2
  Syntax:    mov [reg1], reg2
  Example:  mov [b], a

Immediate:
  Encoding:  0x5   00   r2   data
  Syntax:    mov [reg], data
  Example:  mov [b], 10
```

Stores a value to memory (at DS segment).

#### 0x6 - SEG (Segment Operations)

```
Set from Immediate:
  Encoding:  0x6   00   seg   num
  Syntax:    mov seg, num
  Example:  mov cs, 0x10

Set from Register:
  Encoding: 0x6   r1   seg
  Syntax:    mov seg, reg
  Example:  mov cs, a
```

| seg | Value | Description |
|-----|-------|-------------|
| cs | 0b00 | Code Segment |
| ds | 0b01 | Data Segment |

#### 0x7 - ADD (Addition)

```
Register + Register:
  Encoding:  0x7   r1   r2
  Syntax:    add reg1, reg2
  Example:  add a, b

Register + Immediate:
  Encoding:  0x7   r1   00   data
  Syntax:    add reg, data
  Example:  add a, 10

Immediate + Register:
  Encoding:  0x7   00   r2   data
  Syntax:    add data, reg
  Example:  add 10, b
```

Adds two values, stores result in first register. Updates C, Z, N flags.

#### 0x8 - ADC (Add with Carry)

```
Encoding:  0x8   r1   r2
Syntax:   adc reg1, reg2

Encoding:  0x8   r1   00   data
Syntax:   adc reg, data
```

Adds with carry flag included.

#### 0x9 - SUB (Subtract)

```
Register - Register:
  Encoding:  0x9   r1   r2
  Syntax:    sub reg1, reg2
  Example:  sub a, b

Register - Immediate:
  Encoding:  0x9   r1   00   data
  Syntax:    sub reg, data
  Example:  sub a, 10
```

Subtracts (first - second). Updates flags.

#### 0xA - SBC (Subtract with Carry)

```
Encoding:  0xA   r1   r2
Syntax:   sbc reg1, reg2

Encoding:  0xA   r1   00   data
Syntax:   sbc reg, data
```

Subtracts with borrow (carry flag).

#### 0xB - CMP (Compare)

```
Encoding:  0xB   r1   r2
Syntax:   cmp reg1, reg2

Encoding:  0xB   r1   00   data
Syntax:   cmp reg, data
```

Subtracts but discards result. Only updates flags.

#### 0xC - AND (Logical AND)

```
Encoding:  0xC   r1   r2
Syntax:   and reg1, reg2

Encoding:  0xC   r1   00   data
Syntax:   and reg, data
```

Performs bitwise AND. Updates Z, N flags only.

#### 0xD - OR (Logical OR)

```
Encoding:  0xD   r1   r2
Syntax:   or reg1, reg2

Encoding:  0xD   r1   00   data
Syntax:   or reg, data
```

Performs bitwise OR. Updates Z, N flags only.

#### 0xE - XOR (Logical XOR)

```
Encoding:  0xE   r1   r2
Syntax:   xor reg1, reg2

Encoding:  0xE   r1   00   data
Syntax:   xor reg, data
```

Performs bitwise XOR. Updates Z, N flags only.

#### 0xF - Shift/Rotate Operations

```
SHR (Shift Right Logical):
  Encoding:  0xF   r1   00
  Syntax:   shr reg
  Example:  shr a

ROR (Rotate Right):
  Encoding:  0xF   r1   01
  Syntax:   ror reg
  Example:  ror a

ASR (Arithmetic Shift Right):
  Encoding:  0xF   r1   10
  Syntax:   asr reg
  Example:  asr a
```

### 3.4 Macro Instructions

These are assembled into multiple native instructions:

```asm
; Shift Left ( via add )
shl reg          ; reg = reg + reg

; Rotate Left
rol reg         ; adc reg, reg

; Branch on Carry Set
bcs addr        ; scd c + jif addr

; Branch on Carry Clear
bcc addr        ; scd nc + jif addr

; Branch on Equal
beq addr        ; scd z + jif addr

; Branch on Not Equal
bne addr        ; scd nz + jif addr

; Branch on Negative
bmi addr        ; scd n + jif addr

; Branch on Positive
bpl addr        ; scd nn + jif addr
```

---

## 4. Assembly Language

### 4.1 Directives

```asm
; Bank definition
#bankdef name {
    #bits 8           ; Word size (8 bits)
    #addr 0x00       ; Default address
    #outp 0          ; Output number
}

; Set address
#addr 0x10

; Define data
#d "string"
#d 10, 20, 30
```

### 4.2 Labels

Labels are defined with a colon:

```asm
start:
    mov a, 10
    jmp start
```

### 4.3 Comments

Semicolon (;) marks comments:

```asm
; This is a comment
mov a, 10    ; Load 10 into A
```

### 4.4 Program Structure

```asm
#bankdef lc4 {
    #bits 8
    #addr 0x00
    #outp 0
}

#addr 0x10
init:
    ; Initialize
    mov ds, 0x00
    mov cs, 0x00
    
    ; Main loop
loop:
    ; ... code ...
    jmp loop

; Data
message:
    #d "Hello!\0"
```

---

## 5. Memory Map

### 5.1 Segment Overview

| Segment | Use |
|---------|-----|
| 0x00 | Bootloader |
| 0x01-0x0F | Reserved |
| 0x10 | User program code |
| 0x20-0x3F | User RAM |
| 0x40 | TTY (Terminal) |
| 0x41-0xFF | User defined |

### 5.2 TTY Segment (0x40)

The TTY (terminal) is at segment 0x40, address 0:

| Address | Use |
|---------|-----|
| 0x40:0 | TTY output (write char) |
| 0x40:0 | TTY input (read char) |

Writing to address 0 outputs a character. Reading from address 0 gets input.

### 5.3 Boot Memory

| Address | Use |
|---------|-----|
| 0x00 | Boot entry |
| 0x10 | Program start |

---

## 6. Hardware Implementation

### 6.1 Components Used

The CPU is built in Logic World using the following components:

| Component | Count | Use |
|-----------|-------|-----|
| MHG.CircuitBoard | 125 | PCB substrate |
| MHG.Relay | 222 | Latching memory |
| MHG.Inverter | 74 | Signal inversion |
| MHG.AndGate | 24 | Logic AND |
| MHG.XorGate | 33 | Logic XOR |
| MHG.DLatch | 69 | Data latching |
| MHG.Buffer | 15 | Signal buffering |
| MHG.Buffer_WithOutput | 12 | Buffered output |
| MHG.Peg | 525 | Connection points |
| MHG.ThroughPeg | 61 | Pass-through |
| MHG.ChubbySocket | 192 | I/O connectors |
| MHG.Switch | 3 | Input switches |
| MHG.Socket | 8 | Headers |

### 6.2 Subassemblies

The project is organized into subassemblies in `lwSub/`:

| Subassembly | Description |
|-----------|------------|
| LWCPU4 | Main CPU |
| LWCPU4-Bootloader | Boot ROM |
| LWCPU4-Program_ram | Program RAM |
| LWCPU4-bus | Address/data bus |
| LWCPU4-controll-card | Control logic |
| LWCPU4-modem-card | Modem interface |
| LWCPU4-sereail | Serial interface |

### 6.3 Statistics

- Total components: 1,429
- Total wires: 1,875
- Game version: 0.92.3.57
- Save format: v7 (Blotter)

---

## 7. Software & Tools

### 7.1 Assembler (CustomASM)

```bash
customasm.exe input.asm -o output.bin
```

### 7.2 Web Emulator

Open `index.html` in a web browser to use the visual emulator.

### 7.3 CLI Emulator

```bash
node emulators/cli.js boot.bin program.bin [-l address] [-b]
```

**Options:**
- `-l, --load-addr` - Load address (default: 0x10)
- `-b, --bootloader` - Load bootloader

**Controls:**
- SPACE - Run/Pause
- R - Reset
- T - Toggle speed
- Q - Quit

---

## 8. Programming Guide

### 8.1 Hello World

```asm
#bankdef lc4 {
    #bits 8
    #addr 0x00
    #outp 0
}

#addr 0x10
init:
    mov b, message
print:
    mov ds, 0x00
    mov a, [b]
    scd z
    jif .end
    mov ds, 0x40
    mov [0], a
    add b, 1
    jmp print
.end:
    jmp $

message:
    #d "Hello, World!\n\0"
```

### 8.2 String Input

```asm
#bankdef lc4 {
    #bits 8
    #addr 0x00
    #outp 0
}

#addr 0x10
init:
    mov ds, 0x40    ; TTY segment
    mov a, '?'       ; Prompt
    mov [0], a
    mov ds, 0x00
    
    ; Read loop
read:
    mov ds, 0x40
    mov a, [0]
    scd z
    jif read
    
    ; Echo input
    ...
```

---

## 9. Examples

### 9.1 Basic Test

File: `examples/test1.asm`

```asm
mov a, 5
mov b, 3
add a, b
```

### 9.2 TTY Output

File: `examples/tty.asm`

```asm
mov ds, 0x40
mov a, 'H'
mov [0], a
mov a, 'i'
mov [0], a
```

### 9.3 Bootloader

File: `examples/bootloader.asm`

```asm
init:
    mov cs, 0
    mov ds, 0
    jmp 0x10
```

---

## 10. Technical Reference

### 10.1 Instruction Encoding Table

| Op | r1 | r2 | b0 | b1 | b2 | Instruction |
|----|----|----|----|----|----|----|------------|
| 0 | 0 | 0 | 00 | - | - | nop |
| 0 | 1 | - | 01 | 00 | - | spc a |
| 0 | 2 | - | 10 | 00 | - | spc b |
| 1 | 0 | 0 | 10 | 00 | addr | jmp addr |
| 1 | 0 | 1 | 11 | 00 | addr | jif addr |
| 2 | - | - | 20 | cond | - | scd cond |
| 3 | r1 | 0 | 30+r1 | 00 | data | mov r1, data |
| 3 | r1 | r2 | 30+r1 | r2 | - | mov r1, r2 |
| 4 | r1 | 0 | 40+r1 | 00 | addr | mov r1, [addr] |
| 4 | r1 | r2 | 40+r1 | r2 | - | mov r1, [r2] |
| 5 | r1 | 0 | 50+r1 | 00 | addr | mov [addr], r1 |
| 5 | r1 | r2 | 50+r1 | r2 | - | mov [r2], r1 |
| 6 | 0 | 0 | 60 | 00 | seg | mov seg, num |
| 6 | r1 | - | 60+r1 | seg | - | mov seg, r1 |
| 7 | r1 | r2 | 70+r1 | r2 | - | add r1, r2 |
| 7 | r1 | 0 | 70+r1 | 00 | data | add r1, data |
| 8 | r1 | r2 | 80+r1 | r2 | - | adc r1, r2 |
| 9 | r1 | r2 | 90+r1 | r2 | - | sub r1, r2 |
| A | r1 | r2 | A0+r1 | r2 | - | sbc r1, r2 |
| B | r1 | r2 | B0+r1 | r2 | - | cmp r1, r2 |
| C | r1 | r2 | C0+r1 | r2 | - | and r1, r2 |
| D | r1 | r2 | D0+r1 | r2 | - | or r1, r2 |
| E | r1 | r2 | E0+r1 | r2 | - | xor r1, r2 |
| F | r1 | 0 | F0+r1 | 00 | - | shr r1 |
| F | r1 | 1 | F0+r1 | 01 | - | ror r1 |
| F | r1 | 2 | F0+r1 | 10 | - | asr r1 |

### 10.2 Condition Codes

| Code | Binary | Name | Meaning |
|------|-------|------|---------|
| 0x1 | 0001 | c | Carry set |
| 0x2 | 0010 | z | Zero |
| 0x4 | 0100 | n | Negative |
| 0x9 | 1001 | nc | Not carry |
| 0xA | 1010 | nz | Not zero |
| 0xC | 1100 | nn | Not negative |

### 10.3 ASCII Control Characters

| Code | Character | Description |
|------|----------|------------|
| 0x00 | NUL | Null |
| 0x0A | LF | Line feed (newline) |
| 0x0D | CR | Carriage return |

---

## Appendix A: File Structure

```
LWCPU4/
├── LWCPU4.asm              ; Instruction definitions
├── index.html             ; Web emulator
├── README.md             ; Quick reference
├── PROJECT.md            ; Full documentation
├── bin/                 ; Binary files
│   ├── boot.bin
│   ├── hello.bin
│   ├── output.bin
│   └── output2.bin
├── examples/             ; Example programs
│   ├── bootloader.asm
│   ├── hello.asm
│   ├── phoneTalk.asm
│   ├── phoneTest.asm
│   ├── stringInput.asm
│   ├── test1.asm
│   ├── tty.asm
│   └── tty.zd
├── emulators/            ; Emulator implementations
│   ├── index.html
│   ├── cli.js
│   └── lib/
│       └── blotter.js
├── realCode/            ; Production code
│   └── modem.asm
└── lwSub/              ; Logic World subassemblies
    ├── LWCPU4/
    ├── LWCPU4-Bootloader/
    ├── LWCPU4-Program_ram/
    ├── LWCPU4-bus/
    ├── LWCPU4-controll-card/
    ├── LWCPU4-modem-card/
    └── LWCPU4-sereail/
```

---

## Appendix B: Revision History

| Date | Version | Changes |
|------|--------|--------|
| 2026 | 1.0 | Initial release |

---

*Document generated for LWCPU4 CPU Project*