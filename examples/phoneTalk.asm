; ============================================
; phoneTalk.asm - Two-Way Serial Bridge
; Bridges serial port 0 (TTY) and serial
; port 2 (phone/modem). Characters received
; on one port are forwarded to the other,
; allowing two-way communication.
; ============================================

; loadram "C:/Users/risto/Documents/Git clones/LWCPU4/bin/output2.bin"
#bankdef lc4 {
    #bits 8
    #addr 0
    #outp 0
}

; Buffer is stored in segment 0x02

#addr 0x10

; --- Initialize IO segment ---
init:
    mov ds, 0x40        ; Set data segment to IO

; --- Main polling loop: check both serial ports ---
loop:
    mov ds, 0x40        ; Ensure we're on the IO segment

    ; Check TTY serial port 0 for incoming data
    and st, 0xfe        ; Clear carry flag
    mov a, [0]          ; Read from TTY serial port
    bcc .charloop1      ; If carry clear, we got data - forward it

    ; Check phone serial port 2 for incoming data
    and st, 0xfe        ; Clear carry flag
    mov a, [2]          ; Read from phone serial port
    bcc .charloop2      ; If carry clear, we got data - forward it

    jmp loop            ; No data on either port, keep polling

; --- Forward TTY -> Phone ---
.charloop1:
    mov [2], a          ; Send TTY character to phone serial
    jmp loop            ; Return to polling

; --- Forward Phone -> TTY ---
.charloop2:
    mov [0], a          ; Send phone character to TTY serial
    jmp loop            ; Return to polling
