"""
LWCPU4 Assembler GUI — a tkinter wrapper around customasm.exe.

Lets you point at a source .asm, one or more `#include`-style definition files
(LWCPU4.asm by default), set output format / output path / defines / extra
args, and assemble with a single button. The customasm command line that's
about to run is shown for transparency.

Run with:  python assemble_gui.py
"""

import json
import os
import shlex
import subprocess
import sys
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext, ttk

# ─── Where to look for customasm and the default ruledef ─────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_CUSTOMASM = os.path.join(SCRIPT_DIR, "customasm.exe")
DEFAULT_DEF_FILE  = os.path.join(SCRIPT_DIR, "LWCPU4.asm")

CONFIG_PATH = os.path.join(SCRIPT_DIR, ".assemble_gui_config.json")

OUTPUT_FORMATS = [
    "binary",
    "hexdump",
    "hexstr",
    "binstr",
    "bindump",
    "annotated",
    "annotatedbin",
    "mif",
    "intelhex",
    "deccomma",
    "hexcomma",
]


class AssembleGUI:
    def __init__(self, root):
        self.root = root
        root.title("LWCPU4 Assembler")
        root.geometry("1100x720")

        # ── State variables ────────────────────────────────────────────
        self.customasm_path = tk.StringVar(value=DEFAULT_CUSTOMASM)
        self.source_path    = tk.StringVar(value="")
        self.def_files      = []                          # list[str]
        self.output_format  = tk.StringVar(value="binary")
        self.output_path    = tk.StringVar(value="")
        self.iters          = tk.IntVar(value=10)
        self.quiet          = tk.BooleanVar(value=False)
        self.print_stdout   = tk.BooleanVar(value=True)   # use -p, don't write file
        self.extra_args     = tk.StringVar(value="")
        self.defines        = {}                          # dict[str,str]
        self.status_text    = tk.StringVar(value="Ready.")

        self._build_ui()
        self._load_config()
        self._refresh_def_list()
        self._refresh_defines_list()
        self._update_command_preview()

    # ─── UI construction ────────────────────────────────────────────────
    def _build_ui(self):
        top = ttk.Frame(self.root, padding=6)
        top.pack(fill=tk.X)

        # Row 1: customasm path
        r1 = ttk.Frame(top)
        r1.pack(fill=tk.X, pady=2)
        ttk.Label(r1, text="customasm:", width=14).pack(side=tk.LEFT)
        ttk.Entry(r1, textvariable=self.customasm_path).pack(side=tk.LEFT, fill=tk.X, expand=True)
        ttk.Button(r1, text="Browse…",
                   command=lambda: self._pick_file(self.customasm_path,
                                                   [("Executable", "*.exe"), ("All files", "*.*")])
                  ).pack(side=tk.LEFT, padx=4)

        # Row 2: source file
        r2 = ttk.Frame(top)
        r2.pack(fill=tk.X, pady=2)
        ttk.Label(r2, text="Source .asm:", width=14).pack(side=tk.LEFT)
        ttk.Entry(r2, textvariable=self.source_path).pack(side=tk.LEFT, fill=tk.X, expand=True)
        ttk.Button(r2, text="Browse…",
                   command=lambda: self._pick_source()
                  ).pack(side=tk.LEFT, padx=4)
        ttk.Button(r2, text="Reload", command=self._reload_source).pack(side=tk.LEFT)

        # Row 3: definition files (multi)
        r3 = ttk.LabelFrame(self.root, text="Definition (ruledef) files — prepended in order", padding=6)
        r3.pack(fill=tk.X, padx=6, pady=4)
        listrow = ttk.Frame(r3)
        listrow.pack(fill=tk.X)
        self.def_listbox = tk.Listbox(listrow, height=3)
        self.def_listbox.pack(side=tk.LEFT, fill=tk.X, expand=True)
        btns = ttk.Frame(listrow)
        btns.pack(side=tk.LEFT, padx=4)
        ttk.Button(btns, text="Add…",    command=self._add_def).pack(fill=tk.X)
        ttk.Button(btns, text="Remove",  command=self._remove_def).pack(fill=tk.X)
        ttk.Button(btns, text="Use Default",
                   command=self._reset_defs).pack(fill=tk.X)

        # Row 4: output settings
        r4 = ttk.LabelFrame(self.root, text="Output", padding=6)
        r4.pack(fill=tk.X, padx=6, pady=4)

        of = ttk.Frame(r4)
        of.pack(fill=tk.X, pady=2)
        ttk.Label(of, text="Format:", width=8).pack(side=tk.LEFT)
        ttk.Combobox(of, textvariable=self.output_format, values=OUTPUT_FORMATS,
                     width=18, state="readonly"
                    ).pack(side=tk.LEFT, padx=4)
        ttk.Checkbutton(of, text="Print to GUI (don't write file)",
                        variable=self.print_stdout,
                        command=self._update_command_preview
                       ).pack(side=tk.LEFT, padx=10)
        ttk.Checkbutton(of, text="Quiet (-q)", variable=self.quiet,
                        command=self._update_command_preview
                       ).pack(side=tk.LEFT, padx=4)
        ttk.Label(of, text="Iters:").pack(side=tk.LEFT, padx=(10, 2))
        ttk.Spinbox(of, from_=1, to=99, width=4, textvariable=self.iters,
                    command=self._update_command_preview
                   ).pack(side=tk.LEFT)

        op = ttk.Frame(r4)
        op.pack(fill=tk.X, pady=2)
        ttk.Label(op, text="Out file:", width=8).pack(side=tk.LEFT)
        ttk.Entry(op, textvariable=self.output_path).pack(side=tk.LEFT, fill=tk.X, expand=True)
        ttk.Button(op, text="Browse…",
                   command=lambda: self._pick_output()).pack(side=tk.LEFT, padx=4)

        ea = ttk.Frame(r4)
        ea.pack(fill=tk.X, pady=2)
        ttk.Label(ea, text="Extra args:", width=8).pack(side=tk.LEFT)
        ttk.Entry(ea, textvariable=self.extra_args).pack(side=tk.LEFT, fill=tk.X, expand=True)

        # Row 5: defines (-dNAME=VALUE)
        r5 = ttk.LabelFrame(self.root, text="Defines (passed as -dNAME=VALUE)", padding=6)
        r5.pack(fill=tk.X, padx=6, pady=4)

        defrow = ttk.Frame(r5)
        defrow.pack(fill=tk.X)
        self.def_name_var  = tk.StringVar()
        self.def_value_var = tk.StringVar()
        ttk.Label(defrow, text="Name:").pack(side=tk.LEFT)
        ttk.Entry(defrow, textvariable=self.def_name_var, width=18).pack(side=tk.LEFT, padx=2)
        ttk.Label(defrow, text="Value:").pack(side=tk.LEFT)
        ttk.Entry(defrow, textvariable=self.def_value_var, width=18).pack(side=tk.LEFT, padx=2)
        ttk.Button(defrow, text="Add / Update", command=self._add_define).pack(side=tk.LEFT, padx=4)
        ttk.Button(defrow, text="Clear All", command=self._clear_defines).pack(side=tk.LEFT)

        self.defines_listbox = tk.Listbox(r5, height=3)
        self.defines_listbox.pack(fill=tk.X, pady=4)
        self.defines_listbox.bind("<Double-Button-1>", self._remove_selected_define)

        # ── Command preview ─────────────────────────────────────────────
        cp = ttk.LabelFrame(self.root, text="Command preview (read-only)", padding=6)
        cp.pack(fill=tk.X, padx=6, pady=4)
        self.cmd_preview = ttk.Entry(cp, state="readonly")
        self.cmd_preview.pack(fill=tk.X)

        # ── Action bar ─────────────────────────────────────────────────
        ab = ttk.Frame(self.root, padding=6)
        ab.pack(fill=tk.X)
        ttk.Button(ab, text="Assemble", command=self._run_assemble).pack(side=tk.LEFT)
        ttk.Button(ab, text="Save Output As…", command=self._save_output_as).pack(side=tk.LEFT, padx=4)
        ttk.Button(ab, text="Save Config", command=self._save_config).pack(side=tk.LEFT)
        ttk.Button(ab, text="Open Emulator", command=self._open_emulator).pack(side=tk.LEFT, padx=4)
        ttk.Label(ab, textvariable=self.status_text, foreground="#555").pack(side=tk.LEFT, padx=10)

        # ── Source / output editors ────────────────────────────────────
        paned = ttk.Panedwindow(self.root, orient=tk.HORIZONTAL)
        paned.pack(fill=tk.BOTH, expand=True, padx=6, pady=(4, 6))

        srcframe = ttk.LabelFrame(paned, text="Source", padding=4)
        self.source_text = scrolledtext.ScrolledText(srcframe, wrap=tk.NONE, font=("Consolas", 10), undo=True)
        self.source_text.pack(fill=tk.BOTH, expand=True)
        paned.add(srcframe, weight=3)

        outframe = ttk.LabelFrame(paned, text="Output / Errors", padding=4)
        self.output_text = scrolledtext.ScrolledText(outframe, wrap=tk.NONE, font=("Consolas", 10), state=tk.NORMAL)
        self.output_text.pack(fill=tk.BOTH, expand=True)
        paned.add(outframe, weight=2)

        # Wire preview-refreshing
        for var in (self.customasm_path, self.source_path, self.output_format,
                    self.output_path, self.extra_args):
            var.trace_add("write", lambda *a: self._update_command_preview())

    # ─── File pickers ───────────────────────────────────────────────────
    def _pick_file(self, var, types):
        path = filedialog.askopenfilename(filetypes=types)
        if path:
            var.set(path)

    def _pick_source(self):
        path = filedialog.askopenfilename(
            filetypes=[("Assembly", "*.asm *.s"), ("All files", "*.*")],
            initialdir=os.path.join(SCRIPT_DIR, "examples"),
        )
        if not path:
            return
        self.source_path.set(path)
        self._reload_source()

    def _reload_source(self):
        path = self.source_path.get().strip()
        if not path or not os.path.isfile(path):
            return
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                contents = f.read()
        except OSError as e:
            messagebox.showerror("Read error", str(e))
            return
        self.source_text.delete("1.0", tk.END)
        self.source_text.insert("1.0", contents)
        self._set_status(f"Loaded {os.path.basename(path)} ({len(contents)} bytes)")

    def _pick_output(self):
        path = filedialog.asksaveasfilename(
            defaultextension=".bin",
            filetypes=[("Binary", "*.bin"), ("Text", "*.txt"), ("All files", "*.*")],
        )
        if path:
            self.output_path.set(path)

    def _save_output_as(self):
        contents = self.output_text.get("1.0", tk.END)
        # If contents look binary (we wrote raw bytes from -p binary), don't
        # offer this — but in practice the GUI re-runs with the file output.
        if not contents.strip():
            messagebox.showinfo("Save output", "Nothing to save yet — assemble first.")
            return
        path = filedialog.asksaveasfilename(defaultextension=".txt")
        if not path:
            return
        try:
            with open(path, "w", encoding="utf-8") as f:
                f.write(contents)
            self._set_status(f"Saved output to {path}")
        except OSError as e:
            messagebox.showerror("Save error", str(e))

    # ─── Definition files ───────────────────────────────────────────────
    def _add_def(self):
        path = filedialog.askopenfilename(
            filetypes=[("Assembly", "*.asm *.s"), ("All files", "*.*")],
            initialdir=SCRIPT_DIR,
        )
        if not path:
            return
        if path not in self.def_files:
            self.def_files.append(path)
            self._refresh_def_list()
            self._update_command_preview()

    def _remove_def(self):
        sel = self.def_listbox.curselection()
        if not sel:
            return
        del self.def_files[sel[0]]
        self._refresh_def_list()
        self._update_command_preview()

    def _reset_defs(self):
        if os.path.isfile(DEFAULT_DEF_FILE):
            self.def_files = [DEFAULT_DEF_FILE]
        else:
            self.def_files = []
        self._refresh_def_list()
        self._update_command_preview()

    def _refresh_def_list(self):
        self.def_listbox.delete(0, tk.END)
        for p in self.def_files:
            self.def_listbox.insert(tk.END, p)

    # ─── Defines (-d) ───────────────────────────────────────────────────
    def _add_define(self):
        name = self.def_name_var.get().strip()
        if not name:
            messagebox.showinfo("Defines", "Enter a name.")
            return
        self.defines[name] = self.def_value_var.get().strip()
        self.def_name_var.set("")
        self.def_value_var.set("")
        self._refresh_defines_list()
        self._update_command_preview()

    def _clear_defines(self):
        self.defines.clear()
        self._refresh_defines_list()
        self._update_command_preview()

    def _remove_selected_define(self, _evt=None):
        sel = self.defines_listbox.curselection()
        if not sel:
            return
        key = list(self.defines.keys())[sel[0]]
        del self.defines[key]
        self._refresh_defines_list()
        self._update_command_preview()

    def _refresh_defines_list(self):
        self.defines_listbox.delete(0, tk.END)
        for k, v in self.defines.items():
            self.defines_listbox.insert(tk.END, f"-d{k}={v}" if v else f"-d{k}")

    # ─── Build & run customasm ──────────────────────────────────────────
    def _build_command(self):
        cmd = [self.customasm_path.get().strip() or DEFAULT_CUSTOMASM]
        # Definition files first, then source (so source can reference rules)
        for d in self.def_files:
            cmd.append(d)
        src = self.source_path.get().strip()
        if src:
            cmd.append(src)
        # Format
        fmt = self.output_format.get().strip() or "binary"
        cmd += ["-f", fmt]
        # Output: either -p (print) or -o <file>
        if self.print_stdout.get():
            cmd.append("-p")
        else:
            out = self.output_path.get().strip()
            if out:
                cmd += ["-o", out]
        # Iterations
        try:
            iters = int(self.iters.get())
            if iters != 10:
                cmd += [f"--iters={iters}"]
        except (ValueError, tk.TclError):
            pass
        if self.quiet.get():
            cmd.append("-q")
        # Defines
        for k, v in self.defines.items():
            cmd.append(f"-d{k}={v}" if v else f"-d{k}")
        # Extra args
        extra = self.extra_args.get().strip()
        if extra:
            cmd += shlex.split(extra, posix=False)
        return cmd

    def _update_command_preview(self):
        try:
            cmd = self._build_command()
        except Exception as e:
            cmd = ["<error: " + str(e) + ">"]
        # Use quoted display when paths contain spaces
        shown = " ".join(shlex.quote(c) if " " in c else c for c in cmd)
        self.cmd_preview.configure(state="normal")
        self.cmd_preview.delete(0, tk.END)
        self.cmd_preview.insert(0, shown)
        self.cmd_preview.configure(state="readonly")

    def _run_assemble(self):
        # If the user edited the source in the editor, write to a temp side-file
        # so they don't have to save manually first. We write next to the
        # original source if it exists; otherwise to a temp file.
        src_path = self.source_path.get().strip()
        edited = self.source_text.get("1.0", tk.END).rstrip("\n") + "\n"

        temp_used = False
        if not src_path:
            # No source file picked — dump to a temp file in SCRIPT_DIR.
            src_path = os.path.join(SCRIPT_DIR, "_gui_scratch.asm")
            self.source_path.set(src_path)
            temp_used = True

        try:
            on_disk = ""
            if os.path.isfile(src_path):
                with open(src_path, "r", encoding="utf-8", errors="replace") as f:
                    on_disk = f.read()
            if on_disk != edited:
                with open(src_path, "w", encoding="utf-8", newline="\n") as f:
                    f.write(edited)
        except OSError as e:
            messagebox.showerror("Write error", str(e))
            return

        cmd = self._build_command()
        self._update_command_preview()

        if not os.path.isfile(cmd[0]):
            messagebox.showerror("Missing customasm",
                                 f"Cannot find {cmd[0]}.\n"
                                 f"Set the customasm path at the top.")
            return

        self.output_text.delete("1.0", tk.END)
        self.output_text.insert(tk.END, "$ " + " ".join(shlex.quote(c) for c in cmd) + "\n\n")
        self.root.update_idletasks()

        try:
            proc = subprocess.run(
                cmd, capture_output=True, text=False, cwd=SCRIPT_DIR
            )
        except OSError as e:
            self.output_text.insert(tk.END, "Failed to run: " + str(e))
            self._set_status("Failed.")
            return

        # Decode stdout: if format is binary, show it as hex; otherwise text.
        stdout = proc.stdout
        stderr = proc.stderr.decode("utf-8", errors="replace") if proc.stderr else ""

        if self.print_stdout.get() and self.output_format.get() == "binary":
            # Render binary as a hexdump-style listing.
            self.output_text.insert(tk.END, self._hexdump(stdout))
        else:
            try:
                self.output_text.insert(tk.END, stdout.decode("utf-8", errors="replace"))
            except Exception:
                self.output_text.insert(tk.END, self._hexdump(stdout))

        if stderr:
            self.output_text.insert(tk.END, "\n──── stderr ────\n" + stderr)

        if proc.returncode == 0:
            self._set_status(f"OK (rc=0){' [scratch source]' if temp_used else ''}")
        else:
            self._set_status(f"customasm exited with code {proc.returncode}")

    @staticmethod
    def _hexdump(data: bytes) -> str:
        lines = []
        for i in range(0, len(data), 16):
            chunk = data[i:i + 16]
            hexs = " ".join(f"{b:02X}" for b in chunk)
            ascii_ = "".join(chr(b) if 32 <= b < 127 else "." for b in chunk)
            lines.append(f"{i:04X}:  {hexs:<48s}  {ascii_}")
        if not lines:
            lines.append("(empty output)")
        return "\n".join(lines) + "\n"

    # ─── Misc ───────────────────────────────────────────────────────────
    def _open_emulator(self):
        index = os.path.join(SCRIPT_DIR, "emulator", "index.html")
        if not os.path.isfile(index):
            messagebox.showinfo("Emulator", f"Cannot find {index}")
            return
        try:
            os.startfile(index)  # Windows
        except AttributeError:
            import webbrowser
            webbrowser.open("file://" + index)

    def _set_status(self, msg):
        self.status_text.set(msg)

    # ─── Config persistence ─────────────────────────────────────────────
    def _save_config(self):
        cfg = {
            "customasm_path": self.customasm_path.get(),
            "source_path":    self.source_path.get(),
            "def_files":      list(self.def_files),
            "output_format":  self.output_format.get(),
            "output_path":    self.output_path.get(),
            "iters":          int(self.iters.get() or 10),
            "quiet":          bool(self.quiet.get()),
            "print_stdout":   bool(self.print_stdout.get()),
            "extra_args":     self.extra_args.get(),
            "defines":        dict(self.defines),
        }
        try:
            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                json.dump(cfg, f, indent=2)
            self._set_status("Saved config.")
        except OSError as e:
            messagebox.showerror("Save config error", str(e))

    def _load_config(self):
        if not os.path.isfile(CONFIG_PATH):
            # default state
            if os.path.isfile(DEFAULT_DEF_FILE):
                self.def_files = [DEFAULT_DEF_FILE]
            return
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg = json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            messagebox.showwarning("Config", f"Failed to load config: {e}")
            return
        self.customasm_path.set(cfg.get("customasm_path", DEFAULT_CUSTOMASM))
        self.source_path.set(cfg.get("source_path", ""))
        self.def_files = list(cfg.get("def_files", [DEFAULT_DEF_FILE] if os.path.isfile(DEFAULT_DEF_FILE) else []))
        self.output_format.set(cfg.get("output_format", "binary"))
        self.output_path.set(cfg.get("output_path", ""))
        self.iters.set(cfg.get("iters", 10))
        self.quiet.set(cfg.get("quiet", False))
        self.print_stdout.set(cfg.get("print_stdout", True))
        self.extra_args.set(cfg.get("extra_args", ""))
        self.defines = dict(cfg.get("defines", {}))
        if self.source_path.get():
            self._reload_source()


def main():
    root = tk.Tk()
    try:
        ttk.Style().theme_use("vista" if sys.platform == "win32" else "clam")
    except tk.TclError:
        pass
    app = AssembleGUI(root)
    root.mainloop()


if __name__ == "__main__":
    main()
