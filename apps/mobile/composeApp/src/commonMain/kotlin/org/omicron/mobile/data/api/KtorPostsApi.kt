package org.omicron.mobile.data.api

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.http.HttpHeaders

class KtorPostsApi(
    private val client: HttpClient,
) : PostsApi {
    override suspend fun timeline(
        origin: String,
        scope: TimelineScope,
        cursor: String?,
        accessToken: String?,
    ): TimelinePageDto {
        val url = "${origin.trimEnd('/')}/api/posts"
        return client.get(url) {
            authorized(accessToken)
            if (scope == TimelineScope.Local) parameter("scope", "local")
            if (cursor != null) parameter("cursor", cursor)
        }.body()
    }

    override suspend fun feed(
        origin: String,
        cursor: String?,
        accessToken: String,
    ): TimelinePageDto {
        val url = "${origin.trimEnd('/')}/api/feed"
        return client.get(url) {
            authorized(accessToken)
            if (cursor != null) parameter("cursor", cursor)
        }.body()
    }

    override suspend fun post(
        origin: String,
        id: String,
        accessToken: String?,
    ): PostDto {
        val url = "${origin.trimEnd('/')}/api/posts/$id"
        return client.get(url) { authorized(accessToken) }.body<SinglePostDto>().post
    }

    override suspend fun relatedPosts(
        origin: String,
        id: String,
        accessToken: String?,
    ): List<PostDto> {
        val url = "${origin.trimEnd('/')}/api/posts/$id/related"
        return client.get(url) { authorized(accessToken) }.body<RelatedPostsDto>().items
    }

    private fun io.ktor.client.request.HttpRequestBuilder.authorized(accessToken: String?) {
        if (accessToken != null) header(HttpHeaders.Authorization, "Bearer $accessToken")
    }
}
