import React, { useState, useMemo } from "react";
import { Link } from "wouter";
import { divisions, agentsByDivision } from "@workspace/agency-agents";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import tanmatraLogo from "@assets/image_1778612904223.png";

export default function Home() {
  const [filter, setFilter] = useState("");

  const filteredDivisions = useMemo(() => {
    if (!filter) return divisions;
    const lower = filter.toLowerCase();
    return divisions.filter((div) => {
      if (div.label.toLowerCase().includes(lower)) return true;
      const agents = agentsByDivision.get(div.slug) || [];
      return agents.some(a => 
        a.title.toLowerCase().includes(lower) || 
        a.description.toLowerCase().includes(lower) ||
        (a.vibe && a.vibe.toLowerCase().includes(lower))
      );
    });
  }, [filter]);

  return (
    <div className="container max-w-screen-2xl py-12 px-4 md:px-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl mb-4">
            Agency Agents Browser
          </h1>
          <p className="text-xl text-muted-foreground">
            Explore a curated collection of specialized AI agent personas. Browse by division, discover workflows, and read detailed mission specifications.
          </p>
        </div>
        <div className="w-full md:w-80 shrink-0 flex flex-col items-start md:items-end gap-4">
          <img
            src={tanmatraLogo}
            alt="Tanmatra"
            className="h-12 md:h-16 w-auto object-contain"
          />
          <div className="relative w-full">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter divisions or agents..."
              className="pl-9"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredDivisions.map((division) => {
          const agents = agentsByDivision.get(division.slug) || [];
          return (
            <Link key={division.slug} href={`/division/${division.slug}`}>
              <Card className="h-full transition-all hover:border-primary/50 hover:shadow-md cursor-pointer group">
                <CardHeader>
                  <CardTitle className="flex justify-between items-center group-hover:text-primary transition-colors">
                    {division.label}
                    <Badge variant="secondary" className="ml-2">
                      {agents.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="line-clamp-3">
                    {agents.slice(0, 3).map(a => a.title).join(", ")}
                    {agents.length > 3 && ", and more..."}
                  </CardDescription>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
      
      {filteredDivisions.length === 0 && (
        <div className="text-center py-20">
          <h3 className="text-lg font-medium text-muted-foreground">No divisions found matching "{filter}"</h3>
        </div>
      )}
    </div>
  );
}
