package org.omicron.mobile.data.api

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.http.HttpHeaders
import io.ktor.http.encodeURLPathPart

class KtorDiscoveryApi(
    private val client: HttpClient,
) : DiscoveryApi {
    override suspend fun search(
        origin: String,
        query: String,
        scope: SearchScope?,
        tag: String?,
        author: String?,
        accessToken: String?,
    ): SearchResultsDto =
        client.get("${origin.trimEnd('/')}/api/search") {
            authorized(accessToken)
            parameter("q", query)
            scope?.let { parameter("scope", it.toWire()) }
            tag?.takeIf { it.isNotBlank() }?.let { parameter("tag", it) }
            author?.takeIf { it.isNotBlank() }?.let { parameter("author", it) }
        }.body()

    override suspend fun trendingPosts(
        origin: String,
        accessToken: String?,
    ): List<PostDto> =
        client.get("${origin.trimEnd('/')}/api/posts/trending") {
            authorized(accessToken)
        }.body<TrendingPostsDto>().items

    override suspend fun trendingTags(
        origin: String,
        accessToken: String?,
    ): List<DiscoveryTagDto> =
        client.get("${origin.trimEnd('/')}/api/tags") {
            authorized(accessToken)
        }.body<TrendingTagsDto>().tags

    override suspend fun suggestedUsers(
        origin: String,
        accessToken: String?,
    ): List<SuggestedUserDto> =
        client.get("${origin.trimEnd('/')}/api/users/suggested") {
            authorized(accessToken)
        }.body<SuggestedUsersDto>().items

    override suspend fun tagDetail(
        origin: String,
        slug: String,
        accessToken: String?,
    ): TagDetailDto =
        client.get("${origin.trimEnd('/')}/api/tags/${slug.pathPart()}") {
            authorized(accessToken)
        }.body()

    override suspend fun tagPosts(
        origin: String,
        slug: String,
        cursor: String?,
        accessToken: String?,
    ): TimelinePageDto =
        client.get("${origin.trimEnd('/')}/api/tags/${slug.pathPart()}/posts") {
            authorized(accessToken)
            cursor?.let { parameter("cursor", it) }
        }.body()

    override suspend fun setTagFollow(
        origin: String,
        slug: String,
        following: Boolean,
        accessToken: String,
    ) {
        val path = "${origin.trimEnd('/')}/api/tags/${slug.pathPart()}/follow"
        if (following) client.post(path) { authorized(accessToken) } else client.delete(path) { authorized(accessToken) }
    }

    private fun SearchScope.toWire(): String =
        when (this) {
            SearchScope.Articles -> "posts"
            SearchScope.People -> "people"
            SearchScope.Tags -> "tags"
        }

    private fun io.ktor.client.request.HttpRequestBuilder.authorized(accessToken: String?) {
        if (accessToken != null) header(HttpHeaders.Authorization, "Bearer $accessToken")
    }

    private fun String.pathPart() = encodeURLPathPart()
}
