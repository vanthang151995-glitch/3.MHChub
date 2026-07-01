(function () {
  var defaultVersion = "light-default-v1";
  var versionKey = "hub-theme-default-version";
  var themeKey = "hub-theme";
  var theme = "light";

  try {
    var storedTheme = localStorage.getItem(themeKey);
    var storedVersion = localStorage.getItem(versionKey);
    if (storedVersion !== defaultVersion) {
      theme = "light";
      localStorage.setItem(versionKey, defaultVersion);
      localStorage.setItem(themeKey, theme);
    } else if (storedTheme === "dark" || storedTheme === "light") {
      theme = storedTheme;
    } else {
      theme = "light";
      localStorage.setItem(themeKey, theme);
    }
  } catch (error) {
    theme = "light";
  }

  document.documentElement.dataset.theme = theme;
})();
