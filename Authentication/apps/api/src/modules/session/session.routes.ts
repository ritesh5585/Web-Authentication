import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import * as svc from "./session.service.js";

const router = Router();
router.use(authenticate);

router.get("/", async (req, res) => {
  const sessions = await svc.listSessions(req.auth!.userId);
  res.json({
    sessions: sessions.map((s) => ({ ...s, current: s.id === req.auth!.sid })),
  });
});

router.delete("/:id", async (req, res) => {
  await svc.revokeSession(req.auth!.userId, req.params.id);
  res.json({ message: "Session revoked" });
});

export default router;
