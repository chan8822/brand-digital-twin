import React from "react";
import { useParams, Link } from "wouter";
import { agentBySlug, UPSTREAM_REPO_URL } from "@workspace/agency-agents";
import { ChevronRight, HomeIcon, ExternalLink } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import NotFound from "./not-found";
import { Button } from "@/components/ui/button";

export default function AgentDetail() {
  const params = useParams<Record<string, string | undefined>>();
  // slug is e.g. "engineering/engineering-ai-data-remediation-engineer"
  // or nested like "game-development/unity/unity-architect"
  const fullSlug = params["*"] ?? "";
  const agent = agentBySlug(fullSlug);

  if (!agent) {
    return <NotFound />;
  }

  // Strip frontmatter from markdown
  const markdownBody = agent.markdown.replace(/^---\n[\s\S]*?\n---\n+/, "");

  const githubUrl = `${UPSTREAM_REPO_URL}/blob/main/${agent.filePath.replace(/^content\//, "")}`;

  return (
    <div className="container max-w-screen-xl py-8 px-4 md:px-8">
      <div className="flex items-center text-sm text-muted-foreground mb-8">
        <Link href="/" className="hover:text-foreground transition-colors flex items-center gap-1">
          <HomeIcon className="w-4 h-4" />
          Home
        </Link>
        <ChevronRight className="w-4 h-4 mx-1" />
        <Link href={`/division/${agent.division}`} className="hover:text-foreground transition-colors">
          {agent.divisionLabel}
        </Link>
        <ChevronRight className="w-4 h-4 mx-1" />
        <span className="text-foreground font-medium truncate max-w-[200px] md:max-w-none">{agent.title}</span>
      </div>

      <div className="bg-card border rounded-xl p-6 md:p-10 mb-8 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start gap-6">
          <div className="max-w-3xl">
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-4 text-foreground">
              {agent.title}
            </h1>
            {agent.vibe && (
              <p className="text-xl font-medium text-primary mb-6">{agent.vibe}</p>
            )}
            <p className="text-lg text-muted-foreground leading-relaxed">
              {agent.description}
            </p>
          </div>
          <div className="shrink-0 flex gap-3">
            <a href={githubUrl} target="_blank" rel="noreferrer">
              <Button variant="outline" className="gap-2">
                View Source on GitHub
                <ExternalLink className="h-4 w-4" />
              </Button>
            </a>
          </div>
        </div>
      </div>

      <div className="bg-background">
        <article className="prose prose-slate dark:prose-invert prose-headings:font-bold prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-a:text-primary max-w-4xl mx-auto pb-20">
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw, rehypeHighlight]}
          >
            {markdownBody}
          </ReactMarkdown>
        </article>
      </div>
    </div>
  );
}
