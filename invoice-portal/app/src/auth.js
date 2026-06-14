function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.redirect("/login");
}

function redirectIfAuthed(req, res, next) {
  if (req.session && req.session.user) return res.redirect("/");
  return next();
}

module.exports = {
  requireAuth,
  redirectIfAuthed
};
