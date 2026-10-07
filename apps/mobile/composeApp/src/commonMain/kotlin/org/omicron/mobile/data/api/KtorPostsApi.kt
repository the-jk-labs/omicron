package org.omicron.mobile.data.api

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.parameter

class KtorPostsApi(
    private val client: HttpClient,
) : PostsApi {
    override suspend fun timeline(
        origin: String,
        scope: TimelineScope,
        cursor: String?,
    ): TimelinePageDto {
        val url = "${origin.trimEnd('/')}/api/posts"
        return client.get(url) {
            if (scope == TimelineScope.Local) parameter("scope", "local")
            if (cursor != null) parameter("cursor", cursor)
        }.body()
    }

    override suspend fun post(
        origin: String,
        id: String,
    ): PostDto {
        val url = "${origin.trimEnd('/')}/api/posts/$id"
        return client.get(url).body<SinglePostDto>().post
    }

    override suspend fun relatedPosts(
        origin: String,
        id: String,
    ): List<PostDto> {
        val url = "${origin.trimEnd('/')}/api/posts/$id/related"
        return client.get(url).body<RelatedPostsDto>().items
    }
}
