// SCR-012 备份与迁移（Page）。

import { useQuery } from "@tanstack/react-query"
import { previewImport } from "@/lib/api"
import { BackupPanel } from "@/components/backup-panel"
import { PageLoading } from "@/pages/states"

export function BackupPage() {
  const { data: preview, isPending } = useQuery({ queryKey: ["import-preview"], queryFn: previewImport })

  if (isPending || !preview) return <PageLoading />

  return <BackupPanel preview={preview} />
}
