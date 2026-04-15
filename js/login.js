let pendingEmail = "";

// ── Tab switching ──────────────────────────────────────────────────
function switchTab(tab) {
    document.getElementById("tabSignIn").classList.toggle("active", tab === "login");
    document.getElementById("tabCreate").classList.toggle("active", tab === "register");
    document.getElementById("loginForm").classList.toggle("active", tab === "login");
    document.getElementById("registerForm").classList.toggle("active", tab === "register");
    document.getElementById("verifyBox").classList.remove("active");
    document.getElementById("loginError").textContent = "";
    document.getElementById("registerError").textContent = "";
}

function setLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    btn.disabled = loading;
    if (btnId === "loginBtn")    btn.textContent = loading ? "Signing in…"  : "Sign In";
    if (btnId === "registerBtn") btn.textContent = loading ? "Creating…"    : "Create Account";
}

function clearInputErrors(...ids) {
    ids.forEach(id => document.getElementById(id).classList.remove("input-error"));
}

// ── Login ──────────────────────────────────────────────────────────
async function doLogin() {
    const email    = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const errEl    = document.getElementById("loginError");
    errEl.textContent = "";
    clearInputErrors("loginEmail", "loginPassword");

    if (!email) {
        errEl.textContent = "Please enter your email address.";
        document.getElementById("loginEmail").classList.add("input-error");
        return;
    }
    if (!password) {
        errEl.textContent = "Please enter your password.";
        document.getElementById("loginPassword").classList.add("input-error");
        return;
    }

    setLoading("loginBtn", true);
    try {
        const res  = await fetch("/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (!res.ok) {
            if (data.code === "EMAIL_NOT_FOUND") {
                errEl.textContent = "No account found with this email.";
                document.getElementById("loginEmail").classList.add("input-error");
            } else if (data.code === "WRONG_PASSWORD") {
                errEl.textContent = "Incorrect password. Please try again.";
                document.getElementById("loginPassword").classList.add("input-error");
                document.getElementById("loginPassword").value = "";
            } else if (data.code === "NOT_VERIFIED") {
                pendingEmail = email;
                await fetch("/auth/resend-verification", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email })
                });
                document.getElementById("verifyEmailDisplay").textContent = email;
                document.getElementById("loginForm").classList.remove("active");
                document.getElementById("verifyBox").classList.add("active");
                document.getElementById("tabSignIn").classList.remove("active");
            } else {
                errEl.textContent = data.error || "Something went wrong.";
            }
            return;
        }
        window.location.href = "index.html";
    } catch {
        errEl.textContent = "Connection error. Is the server running?";
    } finally {
        setLoading("loginBtn", false);
    }
}

// ── Register ───────────────────────────────────────────────────────
async function doRegister() {
    const firstName = document.getElementById("regFirstName").value.trim();
    const lastName  = document.getElementById("regLastName").value.trim();
    const email     = document.getElementById("regEmail").value.trim();
    const password  = document.getElementById("regPassword").value;
    const confirm   = document.getElementById("regConfirm").value;
    const errEl     = document.getElementById("registerError");
    errEl.textContent = "";
    clearInputErrors("regFirstName", "regLastName", "regEmail", "regPassword", "regConfirm");

    if (!firstName) { errEl.textContent = "Please enter your first name."; document.getElementById("regFirstName").classList.add("input-error"); return; }
    if (!lastName)  { errEl.textContent = "Please enter your last name.";  document.getElementById("regLastName").classList.add("input-error");  return; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errEl.textContent = "Please enter a valid email."; document.getElementById("regEmail").classList.add("input-error"); return; }
    if (password.length < 6) { errEl.textContent = "Password must be at least 6 characters."; document.getElementById("regPassword").classList.add("input-error"); return; }
    if (password !== confirm) { errEl.textContent = "Passwords do not match."; document.getElementById("regConfirm").classList.add("input-error"); return; }

    setLoading("registerBtn", true);
    try {
        const res  = await fetch("/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ firstName, lastName, email, password })
        });
        const data = await res.json();

        if (!res.ok) {
            if (data.code === "EMAIL_EXISTS") {
                errEl.textContent = "An account with this email already exists.";
                document.getElementById("regEmail").classList.add("input-error");
            } else {
                errEl.textContent = data.error || "Something went wrong.";
            }
            return;
        }

        pendingEmail = email;
        document.getElementById("verifyEmailDisplay").textContent = email;
        document.getElementById("registerForm").classList.remove("active");
        document.getElementById("verifyBox").classList.add("active");
        document.getElementById("tabCreate").classList.remove("active");
    } catch {
        errEl.textContent = "Connection error. Is the server running?";
    } finally {
        setLoading("registerBtn", false);
    }
}

// ── Verify ─────────────────────────────────────────────────────────
async function doVerify() {
    const code  = document.getElementById("verifyCode").value.trim();
    const errEl = document.getElementById("verifyError");
    errEl.textContent = "";

    if (code.length !== 6) {
        errEl.textContent = "Please enter the full 6-digit code.";
        return;
    }
    try {
        const res  = await fetch("/auth/verify-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: pendingEmail, code })
        });
        const data = await res.json();
        if (!res.ok) { errEl.textContent = data.error || "Invalid or expired code."; return; }
        window.location.href = "index.html";
    } catch {
        errEl.textContent = "Connection error.";
    }
}

// ── Resend ─────────────────────────────────────────────────────────
async function doResend() {
    const errEl = document.getElementById("verifyError");
    errEl.style.color = "#f87171";
    errEl.textContent = "";
    try {
        const res = await fetch("/auth/resend-verification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: pendingEmail })
        });
        if (res.ok) {
            errEl.style.color = "#4ade80";
            errEl.textContent = "Code resent! Check your inbox.";
            setTimeout(() => { errEl.textContent = ""; errEl.style.color = "#f87171"; }, 4000);
        }
    } catch {}
}

// ── Enter key ──────────────────────────────────────────────────────
document.addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    if (document.getElementById("loginForm").classList.contains("active"))         doLogin();
    else if (document.getElementById("registerForm").classList.contains("active")) doRegister();
    else if (document.getElementById("verifyBox").classList.contains("active"))    doVerify();
});

if (new URLSearchParams(window.location.search).get("tab") === "register") {
    switchTab("register");
}