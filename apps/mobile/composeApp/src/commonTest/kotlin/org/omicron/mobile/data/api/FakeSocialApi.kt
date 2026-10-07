package org.omicron.mobile.data.api

class FakeSocialApi : SocialApi {
    var postPage = TimelinePageDto()
    var commentPage = CommentPageDto()
    var localProfileValue = localProfile()
    var remoteProfileValue = remoteProfile()
    var relationActors = RelationActorsDto()
    var postLikeFailure: Throwable? = null
    var recommendationFailure: Throwable? = null
    var commentsFailure: Throwable? = null
    var commentFailure: Throwable? = null
    var commentLikeFailure: Throwable? = null
    var deleteCommentFailure: Throwable? = null
    var readLaterMutationFailure: Throwable? = null
    var profileFailure: Throwable? = null
    var relationFailure: Throwable? = null
    var followFailure: Throwable? = null
    var muteFailure: Throwable? = null
    var blockFailure: Throwable? = null
    var saved = false
    var followState = "following"
    var muted = false
    var blocked = false
    var likeCount = 2
    var recommendedCount = 3
    var commentLikeCount = 1
    var postLikeTokens = mutableListOf<String>()
    var requestedCursors = mutableListOf<String?>()
    var profilePostCursors = mutableListOf<Pair<Boolean, String?>>()

    override suspend fun postLike(origin: String, postId: String, liked: Boolean, accessToken: String): LikeStateDto {
        postLikeFailure?.let { throw it }
        postLikeTokens += accessToken
        likeCount += if (liked) 1 else -1
        return LikeStateDto(likeCount, liked)
    }

    override suspend fun postRecommendation(
        origin: String,
        postId: String,
        recommended: Boolean,
        accessToken: String,
    ): RecommendationStateDto {
        recommendationFailure?.let { throw it }
        recommendedCount += if (recommended) 1 else -1
        return RecommendationStateDto(recommendedCount, recommended)
    }

    override suspend fun comments(origin: String, postId: String, cursor: String?, accessToken: String?): CommentPageDto {
        commentsFailure?.let { throw it }
        requestedCursors += cursor
        return commentPage
    }

    override suspend fun createComment(
        origin: String,
        postId: String,
        content: String,
        parentId: String?,
        accessToken: String,
    ): SingleCommentDto {
        commentFailure?.let { throw it }
        return SingleCommentDto(comment().copy(id = "comment-created", content = content, parentId = parentId))
    }

    override suspend fun commentLike(
        origin: String,
        postId: String,
        commentId: String,
        liked: Boolean,
        accessToken: String,
    ): LikeStateDto {
        commentLikeFailure?.let { throw it }
        commentLikeCount += if (liked) 1 else -1
        return LikeStateDto(commentLikeCount, liked)
    }

    override suspend fun editComment(
        origin: String,
        postId: String,
        commentId: String,
        content: String,
        accessToken: String,
    ): EditedCommentDto = EditedCommentDto(EditedCommentContentDto(commentId, content))

    override suspend fun deleteComment(origin: String, postId: String, commentId: String, accessToken: String) {
        deleteCommentFailure?.let { throw it }
    }

    override suspend fun listsForPost(origin: String, postId: String, accessToken: String) =
        ReadingListsDto(listOf(readLaterList().copy(contains = saved)))

    override suspend fun readLater(origin: String, accessToken: String) = ReadingListEnvelopeDto(readLaterList())

    override suspend fun addToList(origin: String, listId: String, postId: String, accessToken: String) {
        readLaterMutationFailure?.let { throw it }
        saved = true
    }

    override suspend fun removeFromList(origin: String, listId: String, postId: String, accessToken: String) {
        readLaterMutationFailure?.let { throw it }
        saved = false
    }

    override suspend fun localProfile(origin: String, username: String, accessToken: String?): LocalProfileDto {
        profileFailure?.let { throw it }
        return localProfileValue
    }

    override suspend fun remoteProfile(origin: String, handle: String, accessToken: String?): RemoteProfileDto {
        profileFailure?.let { throw it }
        return remoteProfileValue
    }

    override suspend fun localProfilePosts(
        origin: String,
        username: String,
        recommendations: Boolean,
        cursor: String?,
        accessToken: String?,
    ): TimelinePageDto {
        profilePostCursors += recommendations to cursor
        return postPage
    }

    override suspend fun remoteProfilePosts(
        origin: String,
        handle: String,
        recommendations: Boolean,
        cursor: String?,
        accessToken: String?,
    ): TimelinePageDto {
        profilePostCursors += recommendations to cursor
        return postPage
    }

    override suspend fun profileRelations(
        origin: String,
        username: String,
        following: Boolean,
        accessToken: String?,
    ): RelationActorsDto {
        relationFailure?.let { throw it }
        return relationActors
    }

    override suspend fun setFollow(
        origin: String,
        handle: String,
        remote: Boolean,
        following: Boolean,
        accessToken: String,
    ): FollowStateDto {
        followFailure?.let { throw it }
        followState =
            if (following) {
                if (!remote && localProfileValue.user.isPrivate) "requested" else "following"
            } else {
                "none"
            }
        return FollowStateDto(followState)
    }

    override suspend fun setMute(origin: String, handle: String, remote: Boolean, muted: Boolean, accessToken: String) {
        muteFailure?.let { throw it }
        this.muted = muted
    }

    override suspend fun setBlock(origin: String, handle: String, remote: Boolean, blocked: Boolean, accessToken: String) {
        blockFailure?.let { throw it }
        this.blocked = blocked
    }
}

fun localProfile() =
    LocalProfileDto(
        user =
            LocalProfileUserDto(
                id = "user-2",
                username = "writer",
                displayName = "Writer",
                bio = "Bio",
                avatarUrl = "/avatars/writer.jpg",
                isPrivate = false,
                createdAt = "2026-01-01T00:00:00Z",
                tags = listOf(TagDto("writing", "Writing")),
                links = listOf(ProfileLinkDto("website", "https://writer.example", "Website")),
            ),
        counts = FollowCountsDto(4, 6),
        followState = "none",
    )

fun remoteProfile() =
    RemoteProfileDto(
        user =
            RemoteProfileUserDto(
                id = "actor-1",
                username = "writer@remote.example",
                displayName = "Remote Writer",
                host = "remote.example",
                apId = "https://remote.example/@writer",
            ),
        counts = FollowCountsDto(42, 12),
    )

fun comment(id: String = "comment-1") =
    CommentDto(
        id = id,
        content = "A thoughtful response",
        createdAt = "2026-01-01T00:00:00Z",
        author = PostAuthorDto("user-3", "commenter", "Commenter"),
    )

fun readLaterList() =
    ReadingListDto(
        id = "read-later",
        title = "Read later",
        isReadLater = true,
    )
