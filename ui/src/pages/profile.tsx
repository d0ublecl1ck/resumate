// SCR-004 个人资料（Page）。

import { useQuery } from "@tanstack/react-query"
import { getProfile } from "@/lib/api"
import { ProfileWorkspace } from "@/components/profile-workspace"
import { PageLoading } from "@/pages/states"

export function ProfilePage() {
  const { data: profile, isPending } = useQuery({ queryKey: ["profile"], queryFn: getProfile })

  if (isPending || !profile) return <PageLoading />

  return <ProfileWorkspace profile={profile} />
}
