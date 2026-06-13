// /api/skills/* — read-only catalog of agent skills.

export function registerSkillsRoutes(app, ctx) {
  const { authRequired, loadSkillsCatalog } = ctx;

  app.get('/api/skills', authRequired, (req, res) => {
    try {
      const catalog = loadSkillsCatalog().map(({ body: _body, ...meta }) => meta);
      res.json({ ok: true, skills: catalog });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/skills/:slug', authRequired, (req, res) => {
    try {
      const catalog = loadSkillsCatalog();
      const skill = catalog.find(s => s.slug === req.params.slug);
      if (!skill) return res.status(404).json({ error: 'Skill not found' });
      res.json({ ok: true, skill });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
}
