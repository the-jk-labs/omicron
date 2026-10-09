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
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.http.encodeURLPathPart

class KtorAuthoringApi(
    private val client: HttpClient,
) : AuthoringApi {
    override suspend fun createPost(
        origin: String,
        request: CreatePostRequest,
        accessToken: String,
    ): BarePostDto =
        client.post("${origin.trimEnd('/')}/api/posts") {
            authorized(accessToken)
            jsonBody(request)
        }.body<SingleBarePostDto>().post

    override suspend fun updatePost(
        origin: String,
        id: String,
        request: UpdatePostRequest,
        accessToken: String,
    ): BarePostDto =
        client.patch("${origin.trimEnd('/')}/api/posts/${id.pathPart()}") {
            authorized(accessToken)
            jsonBody(request)
        }.body<SingleBarePostDto>().post

    override suspend fun deletePost(
        origin: String,
        id: String,
        notify: Boolean,
        accessToken: String,
    ) {
        client.delete("${origin.trimEnd('/')}/api/posts/${id.pathPart()}") {
            authorized(accessToken)
            if (notify) parameter("notify", "true")
        }
    }

    override suspend fun drafts(
        origin: String,
        cursor: String?,
        accessToken: String,
    ): TimelinePageDto =
        client.get("${origin.trimEnd('/')}/api/posts/drafts") {
            authorized(accessToken)
            cursor?.let { parameter("cursor", it) }
        }.body()

    override suspend fun ownPosts(
        origin: String,
        status: String,
        cursor: String?,
        accessToken: String,
    ): TimelinePageDto =
        client.get("${origin.trimEnd('/')}/api/posts/mine") {
            authorized(accessToken)
            parameter("status", status)
            cursor?.let { parameter("cursor", it) }
        }.body()

    override suspend fun ownCounts(
        origin: String,
        accessToken: String,
    ): OwnCountsDto =
        client.get("${origin.trimEnd('/')}/api/posts/mine/counts") {
            authorized(accessToken)
        }.body()

    override suspend fun uploadImage(
        origin: String,
        bytes: ByteArray,
        contentType: String,
        accessToken: String,
    ): UploadResponseDto =
        client.post("${origin.trimEnd('/')}/api/uploads") {
            authorized(accessToken)
            contentType(ContentType.parse(contentType))
            setBody(bytes)
        }.body()

    private fun io.ktor.client.request.HttpRequestBuilder.authorized(accessToken: String?) {
        if (accessToken != null) header(HttpHeaders.Authorization, "Bearer $accessToken")
    }

    private inline fun <reified T> io.ktor.client.request.HttpRequestBuilder.jsonBody(value: T) {
        contentType(ContentType.Application.Json)
        setBody(value)
    }

    private fun String.pathPart() = encodeURLPathPart()
}
