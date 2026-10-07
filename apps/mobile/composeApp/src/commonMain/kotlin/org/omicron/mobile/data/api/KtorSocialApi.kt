package org.omicron.mobile.data.api

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.HttpHeaders
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.encodeURLPathPart
import kotlinx.serialization.Serializable

class KtorSocialApi(
    private val client: HttpClient,
) : SocialApi {
    override suspend fun postLike(origin: String, postId: String, liked: Boolean, accessToken: String): LikeStateDto {
        val path = "${origin.trimEnd('/')}/api/posts/${postId.pathPart()}/like"
        return if (liked) client.post(path) { authorized(accessToken) }.body() else client.delete(path) { authorized(accessToken) }.body()
    }

    override suspend fun postRecommendation(
        origin: String,
        postId: String,
        recommended: Boolean,
        accessToken: String,
    ): RecommendationStateDto {
        val path = "${origin.trimEnd('/')}/api/posts/${postId.pathPart()}/recommend"
        return if (recommended) {
            client.post(path) { authorized(accessToken) }.body()
        } else {
            client.delete(path) { authorized(accessToken) }.body()
        }
    }

    override suspend fun comments(
        origin: String,
        postId: String,
        cursor: String?,
        accessToken: String?,
    ): CommentPageDto =
        client.get("${origin.trimEnd('/')}/api/posts/${postId.pathPart()}/comments") {
            authorized(accessToken)
            cursor?.let { parameter("cursor", it) }
        }.body()

    override suspend fun createComment(
        origin: String,
        postId: String,
        content: String,
        parentId: String?,
        accessToken: String,
    ): SingleCommentDto =
        client.post("${origin.trimEnd('/')}/api/posts/${postId.pathPart()}/comments") {
            authorized(accessToken)
            jsonBody(CreateCommentRequest(content, parentId))
        }.body()

    override suspend fun commentLike(
        origin: String,
        postId: String,
        commentId: String,
        liked: Boolean,
        accessToken: String,
    ): LikeStateDto {
        val path = "${origin.trimEnd('/')}/api/posts/${postId.pathPart()}/comments/${commentId.pathPart()}/like"
        return if (liked) client.post(path) { authorized(accessToken) }.body() else client.delete(path) { authorized(accessToken) }.body()
    }

    override suspend fun editComment(
        origin: String,
        postId: String,
        commentId: String,
        content: String,
        accessToken: String,
    ): EditedCommentDto =
        client.patch("${origin.trimEnd('/')}/api/posts/${postId.pathPart()}/comments/${commentId.pathPart()}") {
            authorized(accessToken)
            jsonBody(EditCommentRequest(content))
        }.body()

    override suspend fun deleteComment(origin: String, postId: String, commentId: String, accessToken: String) {
        client.delete("${origin.trimEnd('/')}/api/posts/${postId.pathPart()}/comments/${commentId.pathPart()}") {
            authorized(accessToken)
        }
    }

    override suspend fun listsForPost(origin: String, postId: String, accessToken: String): ReadingListsDto =
        client.get("${origin.trimEnd('/')}/api/lists/for-post/${postId.pathPart()}") { authorized(accessToken) }.body()

    override suspend fun readLater(origin: String, accessToken: String): ReadingListEnvelopeDto =
        client.get("${origin.trimEnd('/')}/api/lists/read-later") { authorized(accessToken) }.body()

    override suspend fun addToList(origin: String, listId: String, postId: String, accessToken: String) {
        client.post("${origin.trimEnd('/')}/api/lists/${listId.pathPart()}/items") {
            authorized(accessToken)
            jsonBody(AddListItemRequest(postId))
        }
    }

    override suspend fun removeFromList(origin: String, listId: String, postId: String, accessToken: String) {
        client.delete("${origin.trimEnd('/')}/api/lists/${listId.pathPart()}/items/${postId.pathPart()}") {
            authorized(accessToken)
        }
    }

    override suspend fun localProfile(origin: String, username: String, accessToken: String?): LocalProfileDto =
        client.get("${origin.trimEnd('/')}/api/users/${username.pathPart()}") { authorized(accessToken) }.body()

    override suspend fun remoteProfile(origin: String, handle: String, accessToken: String?): RemoteProfileDto =
        client.get("${origin.trimEnd('/')}/api/remote/users/${handle.pathPart()}") { authorized(accessToken) }.body()

    override suspend fun localProfilePosts(
        origin: String,
        username: String,
        recommendations: Boolean,
        cursor: String?,
        accessToken: String?,
    ): TimelinePageDto = profilePosts("${origin.trimEnd('/')}/api/users/${username.pathPart()}", recommendations, cursor, accessToken)

    override suspend fun remoteProfilePosts(
        origin: String,
        handle: String,
        recommendations: Boolean,
        cursor: String?,
        accessToken: String?,
    ): TimelinePageDto = profilePosts("${origin.trimEnd('/')}/api/remote/users/${handle.pathPart()}", recommendations, cursor, accessToken)

    override suspend fun profileRelations(
        origin: String,
        username: String,
        following: Boolean,
        accessToken: String?,
    ): RelationActorsDto {
        val relation = if (following) "following" else "followers"
        return client.get("${origin.trimEnd('/')}/api/users/${username.pathPart()}/$relation") { authorized(accessToken) }.body()
    }

    override suspend fun setFollow(
        origin: String,
        handle: String,
        remote: Boolean,
        following: Boolean,
        accessToken: String,
    ): FollowStateDto {
        val path = profilePath(origin, handle, remote, "/follow")
        return if (following) client.post(path) { authorized(accessToken) }.body() else client.delete(path) { authorized(accessToken) }.body()
    }

    override suspend fun setMute(origin: String, handle: String, remote: Boolean, muted: Boolean, accessToken: String) {
        val path = profilePath(origin, handle, remote, "/mute")
        if (muted) client.post(path) { authorized(accessToken) } else client.delete(path) { authorized(accessToken) }
    }

    override suspend fun setBlock(origin: String, handle: String, remote: Boolean, blocked: Boolean, accessToken: String) {
        val path = profilePath(origin, handle, remote, "/block")
        if (blocked) client.post(path) { authorized(accessToken) } else client.delete(path) { authorized(accessToken) }
    }

    private suspend fun profilePosts(
        basePath: String,
        recommendations: Boolean,
        cursor: String?,
        accessToken: String?,
    ): TimelinePageDto =
        client.get("$basePath/${if (recommendations) "recommendations" else "posts"}") {
            authorized(accessToken)
            cursor?.let { parameter("cursor", it) }
        }.body()

    private fun profilePath(origin: String, handle: String, remote: Boolean, suffix: String): String {
        val root = if (remote) "/api/remote/users" else "/api/users"
        return "${origin.trimEnd('/')}$root/${handle.pathPart()}$suffix"
    }

    private fun io.ktor.client.request.HttpRequestBuilder.authorized(accessToken: String?) {
        if (accessToken != null) header(HttpHeaders.Authorization, "Bearer $accessToken")
    }

    private inline fun <reified T> io.ktor.client.request.HttpRequestBuilder.jsonBody(value: T) {
        contentType(ContentType.Application.Json)
        setBody(value)
    }

    private fun String.pathPart() = encodeURLPathPart()

    @Serializable
    private data class CreateCommentRequest(val content: String, val parentId: String?)

    @Serializable
    private data class EditCommentRequest(val content: String)

    @Serializable
    private data class AddListItemRequest(val postId: String)
}
