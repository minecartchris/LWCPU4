; ============================================
; LWCPU4 Instruction Set Definition
; For use with the customasm assembler
; ============================================

; --- Registers ---
; a  (01) - General purpose register A
; b  (10) - General purpose register B
; ST (11) - Status/flags register
#subruledef reg {
    a   => 0b01
    b   => 0b10
    ST  => 0b11
}

; --- Condition codes for scd (set condition) ---
; Used with jif to create conditional branching
; c  - Carry flag set
; z  - Zero flag set
; n  - Negative flag set
; nc - Carry flag not set (also used as "less than" after cmp)
; nz - Zero flag not set (not equal)
; nn - Negative flag not set (positive or zero)
#subruledef cond {
    c   => 0b0001
    z   => 0b0010
    n   => 0b0100
    nc  => 0b1001
    nz  => 0b1010
    nn  => 0b1100
}

; --- Memory segments ---
; cs - Code segment (selects which 256-byte page to execute from)
; ds - Data segment (selects which 256-byte page to read/write)
#subruledef segment {
    cs  => 0b00
    ds  => 0b01
}

#ruledef {
    ; === Control flow ===
    nop => 0x00                         ; No operation
    spc {op1: reg}  => 0x0 @ op1 @ 0b00 ; Store program counter into register

    jmp {addr: u8}  => 0x10 @ addr      ; Jump to absolute address
    jmp {op1: reg}  => 0x1 @ op1 @ 0b00 ; Jump to address in register

    jif {addr: u8}  => 0x11 @ addr      ; Jump if condition (set by scd) is true
    jif {op1: reg}  => 0x1 @ op1 @ 0b01 ; Jump if condition, address in register

    scd {c: cond}   => 0x2 @ c          ; Set condition for next jif instruction

    ; === Data movement ===
    mov {op1: reg}, {data: i8}  => 0x3 @ op1 @ 0b00 @ data  ; Load immediate value into register
    mov {op1: reg}, {op2: reg}  => 0x3                       ; Copy register to register

    mov {op1: reg}, [{addr: u8}]    => 0x4 @ op1 @ 0b00 @ addr ; Load from memory address into register
    mov {op1: reg}, [{op2: reg}]    => 0x4 @ op1 @ op2         ; Load from memory (register-indirect) into register

    mov [{addr: u8}], {op1: reg}    => 0x5 @ op1 @ 0b00 @ addr ; Store register to memory address
    mov [{op2: reg}], {op1: reg}    => 0x5 @ op1 @ op2         ; Store register to memory (register-indirect)
    mov [{op2: reg}], {data: u8}    => 0x5 @ 0b00 @ op2 @ data ; Store immediate value to memory (register-indirect)

    mov {seg: segment}, {num: u8}   => 0x6 @ 0b00 @ seg @ num  ; Set segment register to immediate value
    mov {seg: segment}, {op1: reg}  => 0x6 @ op1 @ seg         ; Set segment register from register

    ; === Arithmetic ===
    add {op1: reg}, {op2: reg}  => 0x7 @ op1 @ op2             ; Add: op1 = op1 + op2
    add {op1: reg}, {data: i8}  => 0x7 @ op1 @ 0b00 @ data     ; Add immediate: op1 = op1 + data
    add {data: i8}, {op2: reg}  => 0x7 @ 0b00 @ op2 @ data     ; Add immediate to register (alt form)

    adc {op1: reg}, {op2: reg}  => 0x8 @ op1 @ op2             ; Add with carry: op1 = op1 + op2 + carry
    adc {op1: reg}, {data: i8}  => 0x8 @ op1 @ 0b00 @ data     ; Add with carry, immediate
    adc {data: i8}, {op2: reg}  => 0x8 @ 0b00 @ op2 @ data     ; Add with carry, immediate (alt form)

    sub {op1: reg}, {op2: reg}  => 0x9 @ op1 @ op2             ; Subtract: op1 = op1 - op2
    sub {op1: reg}, {data: i8}  => 0x9 @ op1 @ 0b00 @ data     ; Subtract immediate
    sub {data: i8}, {op2: reg}  => 0x9 @ 0b00 @ op2 @ data     ; Subtract immediate (alt form)

    sbc {op1: reg}, {op2: reg}  => 0xa @ op1 @ op2             ; Subtract with borrow: op1 = op1 - op2 - carry
    sbc {op1: reg}, {data: i8}  => 0xa @ op1 @ 0b00 @ data     ; Subtract with borrow, immediate
    sbc {data: i8}, {op2: reg}  => 0xa @ 0b00 @ op2 @ data     ; Subtract with borrow, immediate (alt form)

    cmp {op1: reg}, {op2: reg}  => 0xb @ op1 @ op2             ; Compare (subtract without storing result, sets flags)
    cmp {op1: reg}, {data: i8}  => 0xb @ op1 @ 0b00 @ data     ; Compare register with immediate
    cmp {data: i8}, {op2: reg}  => 0xb @ 0b00 @ op2 @ data     ; Compare immediate with register

    ; === Bitwise logic ===
    and {op1: reg}, {op2: reg}  => 0xc @ op1 @ op2             ; Bitwise AND
    and {op1: reg}, {data: i8}  => 0xc @ op1 @ 0b00 @ data     ; Bitwise AND with immediate
    and {data: i8}, {op2: reg}  => 0xc @ 0b00 @ op2 @ data     ; Bitwise AND with immediate (alt form)

    or {op1: reg}, {op2: reg}   => 0xd @ op1 @ op2             ; Bitwise OR
    or {op1: reg}, {data: i8}   => 0xd @ op1 @ 0b00 @ data     ; Bitwise OR with immediate
    or {data: i8}, {op2: reg}   => 0xd @ 0b00 @ op2 @ data     ; Bitwise OR with immediate (alt form)

    xor {op1: reg}, {op2: reg}  => 0xe @ op1 @ op2             ; Bitwise XOR
    xor {op1: reg}, {data: i8}  => 0xe @ op1 @ 0b00 @ data     ; Bitwise XOR with immediate
    xor {data: i8}, {op2: reg}  => 0xe @ 0b00 @ op2 @ data     ; Bitwise XOR with immediate (alt form)

    ; === Bit shifting ===
    shr {op1: reg}  => 0xf @ op1 @ 0b00 ; Shift right logical (zero fills MSB)
    ror {op1: reg}  => 0xf @ op1 @ 0b01 ; Rotate right through carry
    asr {op1: reg}  => 0xf @ op1 @ 0b10 ; Arithmetic shift right (sign-extends MSB)

    ; === Pseudo-instructions (expand to real instructions) ===
    shl {op1}   => asm {                ; Shift left (implemented as add with itself)
        add {op1}, {op1}
    }

    rol {op1}   => asm {                ; Rotate left through carry (implemented as adc with itself)
        adc {op1}, {op1}
    }

    ; === Branch pseudo-instructions (set condition + jump if true) ===
    bcs {op1} => asm {                  ; Branch if carry set
        scd c
        jif {op1}
    }
    bcc {op1} => asm {                  ; Branch if carry clear
        scd nc
        jif {op1}
    }
    beq {op1} => asm {                  ; Branch if equal (zero set)
        scd z
        jif {op1}
    }
    bne {op1} => asm {                  ; Branch if not equal (zero clear)
        scd nz
        jif {op1}
    }
    bmi {op1} => asm {                  ; Branch if minus (negative set)
        scd n
        jif {op1}
    }
    bpl {op1} => asm {                  ; Branch if plus (negative clear)
        scd nn
        jif {op1}
    }
}