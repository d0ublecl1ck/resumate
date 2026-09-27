from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy.orm import Session

from app.modules.jd import dao as jd_dao
from app.modules.jd.models import JobDescription
from app.modules.profile import dao as profile_dao
from app.modules.profile.models import Profile, ProfileFact
from app.modules.resume import dao as resume_dao
from app.modules.resume.models import Resume, ResumeVersion
from app.shared.errors import ValidationFailed

from .schemas import (
    SUPPORTED_FORMAT,
    BackupIdMapping,
    BackupManifest,
    BackupNewResource,
    BackupResourceCounts,
    BindingRestore,
    ImportCounts,
    ImportPreviewResponse,
    ImportResultResponse,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _parse_dt(value: Any, fallback: datetime | None) -> datetime | None:
    if not value:
        return fallback
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return fallback


def _jd_title(jd: dict) -> str:
    company = (jd.get("company") or "").strip()
    role = (jd.get("role") or "未命名岗位").strip()
    return f"{company} · {role}" if company else role


def export_backup(db: Session, owner_id: str) -> dict:
    profile = profile_dao.get_profile_by_owner(db, owner_id)
    profiles: list[dict] = []
    if profile is not None:
        profiles.append(
            {
                "id": profile.id,
                "displayName": profile.display_name,
                "basics": profile.basics or {},
                "createdAt": _iso(profile.created_at),
                "updatedAt": _iso(profile.updated_at),
                "facts": [
                    {
                        "id": fact.id,
                        "type": fact.type,
                        "title": fact.title,
                        "content": fact.content,
                        "tags": fact.tags,
                        "source": fact.source,
                        "evidence": fact.evidence,
                        "confidence": fact.confidence,
                        "verifiedAt": _iso(fact.verified_at),
                        "visibility": fact.visibility,
                        "createdAt": _iso(fact.created_at),
                        "updatedAt": _iso(fact.updated_at),
                    }
                    for fact in profile_dao.list_facts(db, profile.id)
                ],
            }
        )
    resumes = [
        {
            "id": resume.id,
            "title": resume.title,
            "targetRole": resume.target_role,
            "tags": resume.tags,
            "templateId": resume.template_id,
            "templateVersion": resume.template_version,
            "currentVersionId": resume.current_version_id,
            "lifecycle": resume.lifecycle,
            "saveState": resume.save_state,
            "document": resume.document or {},
            "profileId": resume.profile_id,
            "restoreDeadline": _iso(resume.restore_deadline),
            "createdAt": _iso(resume.created_at),
            "updatedAt": _iso(resume.updated_at),
        }
        for resume in resume_dao.list_owner_resumes(db, owner_id)
    ]
    versions = [
        {
            "id": version.id,
            "resumeId": version.resume_id,
            "source": version.source,
            "actorId": version.actor_id,
            "message": version.message,
            "changeCount": version.change_count,
            "affectedSections": version.affected_sections,
            "snapshot": version.snapshot or {},
            "parentVersionId": version.parent_version_id,
            "baseVersionId": version.base_version_id,
            "startedAt": _iso(version.started_at),
            "committedAt": _iso(version.committed_at),
        }
        for version in resume_dao.list_all_versions(db, owner_id)
    ]
    jds = [
        {
            "id": jd.id,
            "role": jd.role,
            "company": jd.company,
            "body": jd.body,
            "sourceUrl": jd.source_url,
            "tags": jd.tags,
            "revision": jd.revision,
            "boundResumeId": jd.bound_resume_id,
            "createdAt": _iso(jd.created_at),
            "updatedAt": _iso(jd.updated_at),
        }
        for jd in jd_dao.list_jds(db, owner_id)
    ]
    return {
        "formatVersion": SUPPORTED_FORMAT,
        "exportedAt": _iso(_now()),
        "ownerId": owner_id,
        "resources": {
            "profiles": profiles,
            "resumes": resumes,
            "resumeVersions": versions,
            "jobDescriptions": jds,
        },
    }


def export_markdown(db: Session, owner_id: str) -> str:
    data = export_backup(db, owner_id)
    resources = data["resources"]
    lines = [
        "# Resumate 备份索引",
        "",
        f"- 格式：{data['formatVersion']}",
        f"- 导出时间：{data['exportedAt']}",
        "- 说明：此索引仅便于阅读，完整恢复请使用 JSON 导出。",
        "",
    ]
    for profile in resources["profiles"]:
        lines.append(f"## Profile · {profile['displayName']}")
        lines.append(f"- 事实 {len(profile['facts'])} 条")
        for fact in profile["facts"]:
            lines.append(f"  - [{fact['type']}] {fact['title']}")
        lines.append("")
    lines.append("## 简历")
    for resume in resources["resumes"]:
        lines.append(f"- {resume['title']}（{resume['lifecycle']}）")
    lines.append("")
    lines.append("## 岗位")
    for jd in resources["jobDescriptions"]:
        lines.append(f"- {_jd_title(jd)}")
    lines.append("")
    lines.append(f"版本总数：{len(resources['resumeVersions'])}")
    return "\n".join(lines) + "\n"


def _resources(payload: Any) -> dict:
    if not isinstance(payload, dict):
        raise ValidationFailed("备份文件必须是 JSON 对象")
    if payload.get("formatVersion") != SUPPORTED_FORMAT:
        raise ValidationFailed(f"不支持的备份格式版本：{payload.get('formatVersion')!r}")
    resources = payload.get("resources")
    if not isinstance(resources, dict):
        raise ValidationFailed("备份缺少 resources 字段")
    return resources


def _collect(resources: dict) -> tuple[list[dict], list[dict], list[dict], list[dict]]:
    profiles = [item for item in resources.get("profiles") or [] if isinstance(item, dict)]
    resumes = [item for item in resources.get("resumes") or [] if isinstance(item, dict)]
    versions = [item for item in resources.get("resumeVersions") or [] if isinstance(item, dict)]
    jds = [item for item in resources.get("jobDescriptions") or [] if isinstance(item, dict)]
    return profiles, resumes, versions, jds


def _bindings(jds: list[dict], resumes: list[dict]) -> list[BindingRestore]:
    titles = {resume.get("id"): resume.get("title") or "未命名简历" for resume in resumes}
    restores: list[BindingRestore] = []
    for jd in jds:
        bound = jd.get("boundResumeId")
        if not bound:
            continue
        restores.append(
            BindingRestore(
                jd=_jd_title(jd),
                resume=titles.get(bound, "—"),
                status="mapped" if bound in titles else "unmapped",
            )
        )
    return restores


def preview_import(db: Session, owner_id: str, payload: Any) -> ImportPreviewResponse:
    resources = _resources(payload)
    profiles, resumes, versions, jds = _collect(resources)
    resume_ids = {item.get("id") for item in resumes}
    version_ids = {item.get("id") for item in versions}
    profile_ids = {item.get("id") for item in profiles}

    mappings: list[BackupIdMapping] = []
    for index, profile in enumerate(profiles, 1):
        mappings.append(BackupIdMapping(original_id=str(profile.get("id")), new_id=f"import_profile_{index}", type="Profile"))
    for index, resume in enumerate(resumes, 1):
        mappings.append(BackupIdMapping(original_id=str(resume.get("id")), new_id=f"import_resume_{index}", type="Resume"))
    for index, version in enumerate(versions, 1):
        mappings.append(BackupIdMapping(original_id=str(version.get("id")), new_id=f"import_version_{index}", type="ResumeVersion"))
    for index, jd in enumerate(jds, 1):
        mappings.append(BackupIdMapping(original_id=str(jd.get("id")), new_id=f"import_jd_{index}", type="JD"))

    missing: list[str] = []
    for resume in resumes:
        if resume.get("profileId") and resume["profileId"] not in profile_ids:
            missing.append(f"简历「{resume.get('title')}」引用的 Profile {resume['profileId']} 在备份中缺失")
        if resume.get("currentVersionId") and resume["currentVersionId"] not in version_ids:
            missing.append(f"简历「{resume.get('title')}」的当前版本 {resume['currentVersionId']} 在备份中缺失")
    for version in versions:
        if version.get("resumeId") and version["resumeId"] not in resume_ids:
            missing.append(f"版本 {version.get('id')} 引用的简历 {version['resumeId']} 在备份中缺失")
    bindings = _bindings(jds, resumes)
    for restore in bindings:
        if restore.status == "unmapped":
            missing.append(f"岗位「{restore.jd}」绑定的简历在备份中缺失")

    facts = sum(len(profile.get("facts") or []) for profile in profiles)
    manifest = BackupManifest(
        format_version=SUPPORTED_FORMAT,
        resource_counts=BackupResourceCounts(
            resumes=len(resumes),
            versions=len(versions),
            profiles=len(profiles),
            facts=facts,
            jds=len(jds),
        ),
        attachments=[],
    )
    new_resources = [BackupNewResource(type="Profile", title=profile.get("displayName") or "未命名 Profile") for profile in profiles]
    new_resources += [BackupNewResource(type="Resume", title=resume.get("title") or "未命名简历") for resume in resumes]
    new_resources += [BackupNewResource(type="JD", title=_jd_title(jd)) for jd in jds]
    return ImportPreviewResponse(
        manifest=manifest,
        new_resources=new_resources,
        id_mappings=mappings,
        binding_restores=bindings,
        missing_references=missing,
        status="has_issues" if missing else "valid",
    )


def import_backup(db: Session, owner_id: str, payload: Any) -> ImportResultResponse:
    resources = _resources(payload)
    profiles, resumes, versions, jds = _collect(resources)
    now = _now()
    id_map: dict[str, str] = {}
    mappings: list[BackupIdMapping] = []
    facts_count = 0

    # The schema allows one Profile per owner, so an imported profile container is
    # reused when present; its facts still land as new rows.
    existing_profile = profile_dao.get_profile_by_owner(db, owner_id)
    target_profile_id = existing_profile.id if existing_profile is not None else None
    for profile in profiles:
        if target_profile_id is None:
            target_profile_id = _new_id("profile")
            db.add(
                Profile(
                    id=target_profile_id,
                    owner_id=owner_id,
                    display_name=profile.get("displayName") or "导入的 Profile",
                    basics=profile.get("basics") or {},
                    created_at=_parse_dt(profile.get("createdAt"), now),
                    updated_at=_parse_dt(profile.get("updatedAt"), now),
                )
            )
        id_map[str(profile.get("id"))] = target_profile_id
        mappings.append(BackupIdMapping(original_id=str(profile.get("id")), new_id=target_profile_id, type="Profile"))
        for fact in profile.get("facts") or []:
            if not isinstance(fact, dict):
                continue
            new_fact_id = _new_id("fact")
            id_map[str(fact.get("id"))] = new_fact_id
            mappings.append(BackupIdMapping(original_id=str(fact.get("id")), new_id=new_fact_id, type="ProfileFact"))
            db.add(
                ProfileFact(
                    id=new_fact_id,
                    profile_id=target_profile_id,
                    type=fact.get("type") or "experience",
                    title=fact.get("title") or "未命名事实",
                    content=fact.get("content") or "",
                    tags=fact.get("tags") or [],
                    source=fact.get("source") or "导入",
                    evidence=fact.get("evidence") or {},
                    confidence=float(fact.get("confidence") or 0.5),
                    verified_at=_parse_dt(fact.get("verifiedAt"), None) if fact.get("verifiedAt") else None,
                    visibility=fact.get("visibility") or "private",
                    created_at=_parse_dt(fact.get("createdAt"), now),
                    updated_at=_parse_dt(fact.get("updatedAt"), now),
                )
            )
            facts_count += 1

    for resume in resumes:
        new_resume_id = _new_id("resume")
        id_map[str(resume.get("id"))] = new_resume_id
        mappings.append(BackupIdMapping(original_id=str(resume.get("id")), new_id=new_resume_id, type="Resume"))
        db.add(
            Resume(
                id=new_resume_id,
                owner_id=owner_id,
                profile_id=id_map.get(str(resume.get("profileId"))),
                title=resume.get("title") or "导入的简历",
                target_role=resume.get("targetRole") or "",
                tags=resume.get("tags") or [],
                template_id=resume.get("templateId") or "tpl_classic",
                template_version=int(resume.get("templateVersion") or 1),
                current_version_id=None,
                lifecycle=resume.get("lifecycle") or "active",
                save_state=resume.get("saveState") or "committed",
                document=resume.get("document") or {},
                restore_deadline=None,
                created_at=_parse_dt(resume.get("createdAt"), now),
                updated_at=_parse_dt(resume.get("updatedAt"), now),
            )
        )

    for version in versions:
        new_version_id = _new_id("ver")
        id_map[str(version.get("id"))] = new_version_id
        mappings.append(BackupIdMapping(original_id=str(version.get("id")), new_id=new_version_id, type="ResumeVersion"))
        db.add(
            ResumeVersion(
                id=new_version_id,
                resume_id=id_map.get(str(version.get("resumeId"))) or str(version.get("resumeId")),
                source=version.get("source") or "import",
                actor_id=version.get("actorId") or owner_id,
                message=version.get("message") or "导入版本",
                change_count=int(version.get("changeCount") or 0),
                affected_sections=version.get("affectedSections") or [],
                snapshot=version.get("snapshot") or {},
                parent_version_id=id_map.get(str(version.get("parentVersionId"))),
                base_version_id=id_map.get(str(version.get("baseVersionId"))),
                started_at=_parse_dt(version.get("startedAt"), now),
                committed_at=_parse_dt(version.get("committedAt"), now),
            )
        )

    for jd in jds:
        new_jd_id = _new_id("jd")
        id_map[str(jd.get("id"))] = new_jd_id
        mappings.append(BackupIdMapping(original_id=str(jd.get("id")), new_id=new_jd_id, type="JD"))
        db.add(
            JobDescription(
                id=new_jd_id,
                owner_id=owner_id,
                role=jd.get("role") or "导入的岗位",
                company=jd.get("company"),
                body=jd.get("body") or "",
                source_url=jd.get("sourceUrl"),
                tags=jd.get("tags") or [],
                revision=int(jd.get("revision") or 1),
                bound_resume_id=id_map.get(str(jd.get("boundResumeId"))),
                created_at=_parse_dt(jd.get("createdAt"), now),
                updated_at=_parse_dt(jd.get("updatedAt"), now),
            )
        )

    db.flush()
    for resume in resumes:
        new_resume_id = id_map[str(resume.get("id"))]
        current = resume.get("currentVersionId")
        if current:
            stored = db.get(Resume, new_resume_id)
            if stored is not None:
                stored.current_version_id = id_map.get(str(current))
    db.commit()

    return ImportResultResponse(
        imported=ImportCounts(
            resumes=len(resumes),
            versions=len(versions),
            profiles=len(profiles),
            facts=facts_count,
            jds=len(jds),
        ),
        id_mappings=mappings,
        binding_restores=_bindings(jds, resumes),
    )
