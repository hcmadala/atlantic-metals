document.addEventListener("DOMContentLoaded", () => {
        document.querySelectorAll(".filter-header-toggle").forEach(header => {
            header.addEventListener("click", () => {
                header.nextElementSibling.classList.toggle("show");
            });
        });
    });
