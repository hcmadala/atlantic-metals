async function initAuth() {
    const navAccount = document.getElementById("navAccount");
    if (!navAccount) return;

    try {
        const res  = await fetch("/auth/me");
        const data = await res.json();

        if (res.ok && data.user) {
            navAccount.textContent = data.user.name.split(" ")[0];
            navAccount.href        = "profile.html";
            navAccount.onclick     = null; // just navigate to profile
        } else {
            navAccount.textContent = "Login";
            navAccount.href        = "login.html";
        }
    } catch {
        navAccount.textContent = "Login";
        navAccount.href        = "login.html";
    }
}

document.addEventListener("DOMContentLoaded", initAuth);