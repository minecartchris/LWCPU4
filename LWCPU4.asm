#subruledef reg {
    a   => 1`2
    b   => 2`2
    ST  => 3`2
}

#subruledef cond {
    C   => 0x1
    Z   => 0x2
    N   => 0x4
    NC  => 0x9
    NZ  => 0xa
    NN  => 0xc
}

#subruledef segment {
    cs  => 0`2
    ds  => 1`2
}

#ruledef {
    nop => 0x00
    hlt => 0x01
    rst => 0x02

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
    mov {seg: segment}, {op1: reg}  => 0x6 @ reg @ seg
    
    add {op1: reg}, {op2: reg}  => 0x7 @ op1 @ op2
    add {op1: reg}, {data: i16} => 0x7 @ op1 @ 0b00 @ data
    add {data: i16}, {op2: reg} => 0x7 @ 0b00 @ op2 @ data
    
    adc {op1: reg}, {op2: reg}  => 0x8 @ op1 @ op2
    adc {op1: reg}, {data: i16} => 0x8 @ op1 @ 0b00 @ data
    adc {data: i16}, {op2: reg} => 0x8 @ 0b00 @ op2 @ data
    
    sub {op1: reg}, {op2: reg}  => 0x9 @ op1 @ op2
    sub {op1: reg}, {data: i16} => 0x9 @ op1 @ 0b00 @ data
    sub {data: i16}, {op2: reg} => 0x9 @ 0b00 @ op2 @ data
    
    sbc {op1: reg}, {op2: reg}  => 0xa @ op1 @ op2
    sbc {op1: reg}, {data: i16} => 0xa @ op1 @ 0b00 @ data
    sbc {data: i16}, {op2: reg} => 0xa @ 0b00 @ op2 @ data
    
    cmp {op1: reg}, {op2: reg}  => 0xb @ op1 @ op2
    cmp {op1: reg}, {data: i16} => 0xb @ op1 @ 0b00 @ data
    cmp {data: i16}, {op2: reg} => 0xb @ 0b00 @ op2 @ data
    
    and {op1: reg}, {op2: reg}  => 0xc @ op1 @ op2
    and {op1: reg}, {data: i16} => 0xc @ op1 @ 0b00 @ data
    and {data: i16}, {op2: reg} => 0xc @ 0b00 @ op2 @ data
    
    or {op1: reg}, {op2: reg}   => 0xd @ op1 @ op2
    or {op1: reg}, {data: i16}  => 0xd @ op1 @ 0b00 @ data
    or {data: i16}, {op2: reg}  => 0xd @ 0b00 @ op2 @ data
    
    xor {op1: reg}, {op2: reg}  => 0xe @ op1 @ op2
    xor {op1: reg}, {data: i16} => 0xe @ op1 @ 0b00 @ data
    xor {data: i16}, {op2: reg} => 0xe @ 0b00 @ op2 @ data
    
    shl {op1: reg}  => 0xf @ op1 @ 0b00
    shr {op1: reg}  => 0xf @ op1 @ 0b01
    rol {op1: reg}  => 0xf @ op1 @ 0b10
    ror {op1: reg}  => 0xf @ op1 @ 0b11
}