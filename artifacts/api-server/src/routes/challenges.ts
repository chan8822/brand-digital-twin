import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import {
  createPost,
  ensureChallengeSeeds,
  getChallengeBySlug,
  isMember,
  joinChallenge,
  leaveChallenge,
  listChallenges,
  listPosts,
} from "../lib/challenges";

const router: IRouter = Router();

function requireUser(req: Request, res: Response): string | null {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "login required" });
    return null;
  }
  return req.user.id;
}

router.get("/challenges", async (_req: Request, res: Response) => {
  await ensureChallengeSeeds();
  const challenges = await listChallenges();
  res.json({ challenges });
});

router.get("/challenges/:slug", async (req: Request, res: Response) => {
  await ensureChallengeSeeds();
  const slug = String(req.params["slug"] ?? "");
  const challenge = await getChallengeBySlug(slug);
  if (!challenge) {
    res.status(404).json({ error: "not found" });
    return;
  }
  let joined = false;
  if (req.isAuthenticated()) {
    joined = await isMember(challenge.id, req.user.id);
  }
  const posts = await listPosts(challenge.id, 100);
  res.json({ challenge, joined, posts });
});

router.post("/challenges/:slug/join", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const challenge = await getChallengeBySlug(String(req.params["slug"] ?? ""));
  if (!challenge) {
    res.status(404).json({ error: "not found" });
    return;
  }
  await joinChallenge(challenge.id, userId);
  res.json({ ok: true, joined: true });
});

router.post("/challenges/:slug/leave", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const challenge = await getChallengeBySlug(String(req.params["slug"] ?? ""));
  if (!challenge) {
    res.status(404).json({ error: "not found" });
    return;
  }
  await leaveChallenge(challenge.id, userId);
  res.json({ ok: true, joined: false });
});

const postBody = z.object({
  body: z.string().min(1).max(1000),
  authorName: z.string().min(1).max(128).optional(),
});

router.post("/challenges/:slug/posts", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const challenge = await getChallengeBySlug(String(req.params["slug"] ?? ""));
  if (!challenge) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const member = await isMember(challenge.id, userId);
  if (!member) {
    res.status(403).json({ error: "join the challenge to post" });
    return;
  }
  const parsed = postBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  try {
    const author =
      parsed.data.authorName?.trim() ||
      req.user?.firstName ||
      req.user?.email?.split("@")[0] ||
      "Member";
    const post = await createPost(
      challenge.id,
      userId,
      author,
      parsed.data.body,
    );
    res.json({
      post: {
        id: post.id,
        authorName: post.authorName,
        body: post.body,
        createdAt: post.createdAt,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
  }
});

export default router;
