#bankdef lc4 {
    #bits 8
    #addr 0x00
    #outp 0
}

init:
    mov a, 0x20
    mov ds, 5
    scd nc
.loop:
    mov [0], a
    add a, 1
    cmp a, 0x7f
    jif .loop
    jmp init