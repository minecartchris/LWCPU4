#subruledef reg {
    a   => 0b01
    b   => 0b10
    ST  => 0b11
}

#subruledef cond {
    c   => 0b0001
    z   => 0b0010
    n   => 0b0100
    nc  => 0b1001
    nz  => 0b1010
    nn  => 0b1100
}

#subruledef segment {
    cs  => 0`2
    ds  => 1`2
}

#ruledef {
    nop => 0x00
    spc {op1: reg}  => 0x0 @ op1 @ 0b00

    jmp {addr: u8}  => 0x10 @ addr
    jmp {op1: reg}  => 0x1 @ op1 @ 0b00
    
    jif {addr: u8}  => 0x11 @ addr
    jif {op1: reg}  => 0x1 @ op1 @ 0b01
    
    scd {c: cond}   => 0x2 @ c
    
    mov {op1: reg}, {data: i8}  => 0x3 @ op1 @ 0b00 @ data
    mov {op1: reg}, {op2: reg}  => 0x3
    
    mov {op1: reg}, [{addr: u8}]    => 0x4 @ op1 @ 0b00 @ addr
    mov {op1: reg}, [{op2: reg}]    => 0x4 @ op1 @ op2
    
    mov [{addr: u8}], {op1: reg}    => 0x5 @ op1 @ 0b00 @ addr
    mov [{op2: reg}], {op1: reg}    => 0x5 @ op1 @ op2
    
    mov {seg: segment}, {num: u8}   => 0x6 @ 0b00 @ seg @ num
    mov {seg: segment}, {op1: reg}  => 0x6 @ op1 @ seg
    
    add {op1: reg}, {op2: reg}  => 0x7 @ op1 @ op2
    add {op1: reg}, {data: i8}  => 0x7 @ op1 @ 0b00 @ data
    add {data: i8}, {op2: reg}  => 0x7 @ 0b00 @ op2 @ data
    
    adc {op1: reg}, {op2: reg}  => 0x8 @ op1 @ op2
    adc {op1: reg}, {data: i8}  => 0x8 @ op1 @ 0b00 @ data
    adc {data: i8}, {op2: reg}  => 0x8 @ 0b00 @ op2 @ data
    
    sub {op1: reg}, {op2: reg}  => 0x9 @ op1 @ op2
    sub {op1: reg}, {data: i8}  => 0x9 @ op1 @ 0b00 @ data
    sub {data: i8}, {op2: reg}  => 0x9 @ 0b00 @ op2 @ data
    
    sbc {op1: reg}, {op2: reg}  => 0xa @ op1 @ op2
    sbc {op1: reg}, {data: i8}  => 0xa @ op1 @ 0b00 @ data
    sbc {data: i8}, {op2: reg}  => 0xa @ 0b00 @ op2 @ data
    
    cmp {op1: reg}, {op2: reg}  => 0xb @ op1 @ op2
    cmp {op1: reg}, {data: i8}  => 0xb @ op1 @ 0b00 @ data
    cmp {data: i8}, {op2: reg}  => 0xb @ 0b00 @ op2 @ data
    
    and {op1: reg}, {op2: reg}  => 0xc @ op1 @ op2
    and {op1: reg}, {data: i8}  => 0xc @ op1 @ 0b00 @ data
    and {data: i8}, {op2: reg}  => 0xc @ 0b00 @ op2 @ data
    
    or {op1: reg}, {op2: reg}   => 0xd @ op1 @ op2
    or {op1: reg}, {data: i8}   => 0xd @ op1 @ 0b00 @ data
    or {data: i8}, {op2: reg}   => 0xd @ 0b00 @ op2 @ data
    
    xor {op1: reg}, {op2: reg}  => 0xe @ op1 @ op2
    xor {op1: reg}, {data: i8}  => 0xe @ op1 @ 0b00 @ data
    xor {data: i8}, {op2: reg}  => 0xe @ 0b00 @ op2 @ data
    
    shr {op1: reg}  => 0xf @ op1 @ 0b00
    ror {op1: reg}  => 0xf @ op1 @ 0b01
    asr {op1: reg}  => 0xf @ op1 @ 0b10
    
    shl {op1}   => asm {
        add {op1}, {op1}
    }
    
    rol {op1}   => asm {
        adc {op1}, {op1}
    }
}