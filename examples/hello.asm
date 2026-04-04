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
    mov [0], awdw  w 
    add b, 1
    jmp print
.end:
    jmp $
    
message:
    #d "I always come back\n\0"