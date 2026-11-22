"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { RecentProjectList } from "@/components/projects/recent-project-list";
import { PageHeader } from "@/components/shared/page-header";

interface ProjectItem {
  id: string;
  name: string;
  status: string;
  platform: string;
  style: string;
  sectionCount: number;
  updatedAt: string;
  coverImageUrl?: string | null;
}

function loadStoredKey(): string | null {
  try {
    return localStorage.getItem("bm_access_key");
  } catch {
    return null;
  }
}

export default function HistoryPage() {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const key = loadStoredKey();
    fetch("/api/projects", {
      headers: key ? { "x-access-key": key } : {},
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setProjects(data.data);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="历史记录"
        description="查看商品项目，继续分析、规划与编辑。"
      />

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <RecentProjectList initialProjects={projects} />
          )}
    </div>
  );
}
