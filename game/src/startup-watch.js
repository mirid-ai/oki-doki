/* Keep this classic script in ES5 syntax: it must run when modules cannot. */
(function () {
  var appScript = document.getElementById('app-module');
  var opening = document.getElementById('consent-opening');
  var errorPanel = document.getElementById('startup-error');
  function cannotStart() {
    if (opening) opening.hidden = true;
    if (errorPanel) errorPanel.hidden = false;
  }
  if (!('noModule' in document.createElement('script'))) {
    cannotStart();
    return;
  }
  if (!appScript) return;
  // Module execution is deferred until the parser completes, so these
  // listeners are installed first. Module fetch/link failures reach the
  // element; evaluation and syntax failures are reported to window instead.
  var moduleDirectory = appScript.src.slice(0, appScript.src.lastIndexOf('/') + 1);
  function moduleException(event) {
    var filename = event.filename || '';
    var filenameWithoutQuery = filename.split('?')[0].split('#')[0];
    if (filenameWithoutQuery.indexOf(moduleDirectory) === 0 &&
        filenameWithoutQuery !== moduleDirectory + 'register-sw.js' &&
        filenameWithoutQuery !== moduleDirectory + 'startup-watch.js') cannotStart();
  }
  window.addEventListener('error', moduleException);
  appScript.addEventListener('error', cannotStart);
  appScript.addEventListener('load', function () {
    window.removeEventListener('error', moduleException);
  });
  // No timer: a slow connection is not itself a startup failure.
}());
