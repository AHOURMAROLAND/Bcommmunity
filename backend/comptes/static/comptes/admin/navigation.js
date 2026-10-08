(() => {
  const loaderId = "bk-admin-loading";
  const loader = () => document.getElementById(loaderId);

  function showLoader() {
    const element = loader();
    if (!element) return;
    element.hidden = false;
    requestAnimationFrame(() => element.classList.add("is-loading"));
  }

  function hideLoader() {
    const element = loader();
    if (!element) return;
    element.classList.remove("is-loading");
    element.hidden = true;
  }

  function keepFileFormsNative(root = document) {
    root.querySelectorAll("form").forEach((form) => {
      if (form.enctype === "multipart/form-data" || form.querySelector('input[type="file"]')) {
        form.setAttribute("hx-boost", "false");
      }
    });
  }

  function enablePartialNavigation() {
    if (!window.htmx || !document.querySelector("#page")) return;

    document.body.setAttribute("hx-boost", "true");
    document.body.setAttribute("hx-target", "#page");
    document.body.setAttribute("hx-select", "#page");
    document.body.setAttribute("hx-swap", "outerHTML");
    document.body.setAttribute("hx-indicator", `#${loaderId}`);
    keepFileFormsNative();
    window.htmx.process(document.body);
  }

  document.addEventListener("DOMContentLoaded", enablePartialNavigation, { once: true });
  document.addEventListener("htmx:beforeRequest", showLoader);
  document.addEventListener("htmx:afterRequest", hideLoader);
  document.addEventListener("htmx:afterSwap", () => keepFileFormsNative());
  document.addEventListener("submit", (event) => {
    if (event.target instanceof HTMLFormElement && event.target.checkValidity()) {
      showLoader();
    }
  });
  window.addEventListener("pageshow", hideLoader);
})();
