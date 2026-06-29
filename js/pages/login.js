let pendingEmail = "";

async function apiPost(url, body, timeoutMs = 25_000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify(body),
            signal:  controller.signal
        });
        let data = {};
        try { data = await res.json(); } catch { /* empty body */ }
        return { res, data };
    } finally {
        clearTimeout(timer);
    }
}

function connectionErrorMessage() {
    return "Could not reach the server. Check your connection or try again in a moment.";
}

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
        const { res, data } = await apiPost("/auth/login", { email, password });

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
    } catch (e) {
        errEl.textContent = e.name === "AbortError"
            ? "Request timed out. The server may be waking up — try again."
            : connectionErrorMessage();
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
        const { res, data } = await apiPost("/auth/register", {
            firstName, lastName, email, password
        });

        if (!res.ok) {
            if (data.code === "EMAIL_EXISTS") {
                errEl.textContent = "An account with this email already exists.";
                document.getElementById("regEmail").classList.add("input-error");
            } else if (res.status === 503) {
                errEl.textContent = "Email verification is not configured on the server. Contact support.";
            } else if (res.status === 429) {
                errEl.textContent = "Too many attempts. Please wait a few minutes and try again.";
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
    } catch (e) {
        errEl.textContent = e.name === "AbortError"
            ? "Request timed out. The server may be waking up — try again."
            : connectionErrorMessage();
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
        const { res, data } = await apiPost("/auth/verify-email", { email: pendingEmail, code });
        if (!res.ok) { errEl.textContent = data.error || "Invalid or expired code."; return; }
        window.location.href = "index.html";
    } catch (e) {
        errEl.textContent = e.name === "AbortError"
            ? "Request timed out. Try again."
            : connectionErrorMessage();
    }
}

// ── Resend ─────────────────────────────────────────────────────────
async function doResend() {
    const errEl = document.getElementById("verifyError");
    errEl.style.color = "#f87171";
    errEl.textContent = "";
    try {
        const { res } = await apiPost("/auth/resend-verification", { email: pendingEmail });
        if (res.ok) {
            errEl.style.color = "#4ade80";
            errEl.textContent = "Code resent! Check your inbox.";
            setTimeout(() => { errEl.textContent = ""; errEl.style.color = "#f87171"; }, 4000);
        } else {
            errEl.textContent = "Could not resend code. Try again shortly.";
        }
    } catch (e) {
        errEl.textContent = e.name === "AbortError"
            ? "Request timed out. Try again."
            : connectionErrorMessage();
    }
}

// ── Enter key ──────────────────────────────────────────────────────
document.querySelectorAll("[data-auth-tab]").forEach(button => {
    button.addEventListener("click", () => switchTab(button.dataset.authTab));
});
document.getElementById("loginBtn")?.addEventListener("click", doLogin);
document.getElementById("registerBtn")?.addEventListener("click", doRegister);
document.getElementById("verifyBtn")?.addEventListener("click", doVerify);
document.getElementById("resendBtn")?.addEventListener("click", doResend);
document.getElementById("verifyCode")?.addEventListener("input", event => {
    event.target.value = event.target.value.replace(/\D/g, "");
});

document.addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    if (document.getElementById("loginForm").classList.contains("active"))         doLogin();
    else if (document.getElementById("registerForm").classList.contains("active")) doRegister();
    else if (document.getElementById("verifyBox").classList.contains("active"))    doVerify();
});

if (new URLSearchParams(window.location.search).get("tab") === "register") {
    switchTab("register");
}
