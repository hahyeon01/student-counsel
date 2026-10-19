# Security Specification (`security_spec.md`)

## 1. Data Invariants

1. **Global Default Deny**: Any path not explicitly matched is unconditionally denied (`allow read, write: if false;`).
2. **Verified Authentication**: Every read and write operation requires `request.auth != null && request.auth.token.email_verified == true`.
3. **StudentProfile Ownership (`/studentProfiles/{userId}`)**:
   - Document ID `{userId}` must strictly equal `request.auth.uid` and pass `isValidId(userId)`.
   - All required fields must be present and strictly bounded by `hasOnly` and string `.size()` limits.
   - `userId` and `createdAt` are immutable across updates.
   - No PII fields (`email`, `phone`, `address`) are stored.
4. **CounselingSession Integrity (`/counselingSessions/{sessionId}`)**:
   - `{sessionId}` must match `incoming().sessionId` and pass `isValidId(sessionId)`.
   - `ownerId` must equal `request.auth.uid` on create and remain immutable on update.
   - Terminal State Lock: Once `status == 'archived'`, no further updates are permitted (`existing().status != 'archived'`).
   - List queries (`allow list`) must enforce `resource.data.ownerId == request.auth.uid` without `get()` or `exists()` calls.
5. **ChatMessage Relational Master Gate (`/counselingSessions/{sessionId}/messages/{messageId}`)**:
   - A message cannot exist or be read unless the parent `/counselingSessions/{sessionId}` document exists and its `ownerId == request.auth.uid`.
   - Messages cannot be created if the parent session has reached terminal status (`archived`).
   - Messages are immutable once created (`allow update: if false;`).
6. **CareerRoadmapItem Integrity (`/careerRoadmaps/{roadmapId}`)**:
   - `{roadmapId}` must match `incoming().roadmapId` and pass `isValidId(roadmapId)`.
   - `ownerId` must equal `request.auth.uid` and remain immutable.
   - Terminal State Lock: Once `status == 'completed'`, no subsequent updates are allowed (`existing().status != 'completed'`).

---

## 2. The "Dirty Dozen" Payloads

1. **Payload 1 (Identity Spoofing on Profile Create)**:
   Authenticated as `user_A`, writing to `/studentProfiles/user_A` with `userId: "user_B"`. -> **PERMISSION_DENIED**
2. **Payload 2 (Shadow Field Injection on Profile Update)**:
   Authenticated as `user_A`, updating `/studentProfiles/user_A` with extra ghost field `isAdmin: true`. -> **PERMISSION_DENIED**
3. **Payload 3 (Unverified Email Spoof)**:
   Authenticated as `user_A` with `email_verified: false`, attempting to create `/studentProfiles/user_A`. -> **PERMISSION_DENIED**
4. **Payload 4 (Resource Poisoning / Oversized String)**:
   Authenticated as `user_A`, creating `/counselingSessions/sess_1` with a `summary` string of length 2000 (limit 500). -> **PERMISSION_DENIED**
5. **Payload 5 (ID Poisoning Attack)**:
   Authenticated as `user_A`, creating `/counselingSessions/invalid$id!@#` with non-alphanumeric characters. -> **PERMISSION_DENIED**
6. **Payload 6 (Orphaned Subcollection Write / Master Gate Bypass)**:
   Authenticated as `user_A`, creating `/counselingSessions/nonexistent_sess/messages/msg_1` where parent session does not exist. -> **PERMISSION_DENIED**
7. **Payload 7 (Cross-Tenant Subcollection Write)**:
   Authenticated as `user_A`, creating `/counselingSessions/sess_owned_by_B/messages/msg_1`. -> **PERMISSION_DENIED**
8. **Payload 8 (Terminal State Lock Bypass on Session)**:
   Authenticated as `user_A`, updating `/counselingSessions/sess_archived` when `existing().status == 'archived'`. -> **PERMISSION_DENIED**
9. **Payload 9 (Terminal State Lock Bypass on Roadmap)**:
   Authenticated as `user_A`, updating `/careerRoadmaps/road_completed` when `existing().status == 'completed'`. -> **PERMISSION_DENIED**
10. **Payload 10 (Immortal Field Mutation)**:
    Authenticated as `user_A`, updating `/careerRoadmaps/road_1` by changing `createdAt` or `ownerId`. -> **PERMISSION_DENIED**
11. **Payload 11 (Value Poisoning on Whitelisted Update Field)**:
    Authenticated as `user_A`, updating `/careerRoadmaps/road_1` `status` field with `"invalid_status"` outside the allowed enum. -> **PERMISSION_DENIED**
12. **Payload 12 (Blanket List Scraping Attempt)**:
    Authenticated as `user_A`, executing an unconstrained `list` query on `/counselingSessions` without filtering `ownerId == 'user_A'`. -> **PERMISSION_DENIED**
