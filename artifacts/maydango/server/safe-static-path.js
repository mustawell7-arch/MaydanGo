const path = require('path');

function resolveStaticFilePath(staticRoot, urlPath) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(urlPath);
  } catch {
    return null;
  }

  const root = path.resolve(staticRoot);
  const relativePath = decodedPath.replace(/^[/\\]+/, '');
  const resolvedPath = path.resolve(root, relativePath);
  const pathFromRoot = path.relative(root, resolvedPath);
  if (
    pathFromRoot === '..' ||
    pathFromRoot.startsWith(`..${path.sep}`) ||
    path.isAbsolute(pathFromRoot)
  ) {
    return null;
  }

  return resolvedPath;
}

module.exports = { resolveStaticFilePath };
