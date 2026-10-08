package org.omicron.mobile.data.repository

import io.ktor.client.plugins.ClientRequestException
import io.ktor.http.HttpStatusCode
import org.omicron.mobile.data.api.DiscoveryApi
import org.omicron.mobile.data.api.DiscoveryPersonDto
import org.omicron.mobile.data.api.DiscoveryTagDto
import org.omicron.mobile.data.api.SearchScope
import org.omicron.mobile.data.api.SuggestedUserDto
import org.omicron.mobile.data.api.TagDto
import org.omicron.mobile.domain.model.DiscoverContent
import org.omicron.mobile.domain.model.DiscoveryPerson
import org.omicron.mobile.domain.model.DiscoveryTag
import org.omicron.mobile.domain.model.InstanceConfiguration
import org.omicron.mobile.domain.model.Post
import org.omicron.mobile.domain.model.SearchResults
import org.omicron.mobile.domain.model.SuggestedPerson
import org.omicron.mobile.domain.model.TagDetail

class DiscoveryRepository(
    private val api: DiscoveryApi,
    private val savedInstance: suspend () -> InstanceConfiguration?,
    private val accessToken: (suspend (origin: String) -> String?)? = null,
    private val onUnauthorized: (suspend () -> Unit)? = null,
) {
    suspend fun search(
        query: String,
        scope: SearchScope? = null,
        tag: String? = null,
        author: String? = null,
    ): SearchResults {
        val trimmed = query.trim()
        if (trimmed.isEmpty()) return SearchResults(emptyList(), emptyList(), emptyList())
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        val results =
            authorized(origin) { token ->
                api.search(origin, trimmed, scope, tag?.trim()?.ifEmpty { null }, author?.trim()?.ifEmpty { null }, token)
            }
        return SearchResults(
            posts = results.posts.map { it.toDomain(origin) },
            people = results.people.map { it.toDomain(origin) },
            tags = results.tags.map { it.toDomain() },
        )
    }

    suspend fun discover(): DiscoverContent {
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        return authorized(origin) { token ->
            DiscoverContent(
                trendingPosts = api.trendingPosts(origin, token).map { it.toDomain(origin) },
                suggestedPeople = api.suggestedUsers(origin, token).map { it.toDomain(origin) },
                topics = api.trendingTags(origin, token).map { it.toDomain() },
            )
        }
    }

    suspend fun trendingPosts(): List<Post> {
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        return authorized(origin) { token -> api.trendingPosts(origin, token).map { it.toDomain(origin) } }
    }

    suspend fun topics(): List<DiscoveryTag> {
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        return authorized(origin) { token -> api.trendingTags(origin, token).map { it.toDomain() } }
    }

    suspend fun suggestedPeople(): List<SuggestedPerson> {
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        return authorized(origin) { token -> api.suggestedUsers(origin, token).map { it.toDomain(origin) } }
    }

    suspend fun tagDetail(slug: String): TagDetail {
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        return authorized(origin) { token -> api.tagDetail(origin, slug.trim(), token).toDomain() }
    }

    suspend fun tagPosts(slug: String, cursor: String?): TimelinePage {
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        val page = authorized(origin) { token -> api.tagPosts(origin, slug.trim(), cursor, token) }
        return TimelinePage(page.items.map { it.toDomain(origin) }, page.nextCursor)
    }

    suspend fun setTagFollow(slug: String, following: Boolean) {
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        authorized(origin, required = true) { token -> api.setTagFollow(origin, slug.trim(), following, token!!) }
    }

    private suspend fun <T> authorized(
        origin: String,
        required: Boolean = false,
        block: suspend (accessToken: String?) -> T,
    ): T =
        try {
            val token = accessToken?.invoke(origin)
            if (required && token == null) throw UnauthorizedException()
            block(token)
        } catch (exception: ClientRequestException) {
            if (exception.response.status != HttpStatusCode.Unauthorized) throw exception
            onUnauthorized?.invoke()
            throw UnauthorizedException()
        }
}

internal fun DiscoveryTagDto.toDomain() = DiscoveryTag(slug = slug, name = name, postCount = postCount)

internal fun DiscoveryPersonDto.toDomain(origin: String) =
    DiscoveryPerson(
        id = id,
        username = username,
        displayName = displayName,
        avatarUrl = avatarUrl?.let { resolveMediaUrl(origin, it) },
        remote = remote,
    )

internal fun SuggestedUserDto.toDomain(origin: String) =
    SuggestedPerson(
        id = id,
        username = username,
        displayName = displayName,
        avatarUrl = avatarUrl?.let { resolveMediaUrl(origin, it) },
        remote = remote,
        followerCount = followerCount,
    )

internal fun TagDto.toDiscoveryTag(postCount: Int = 0) = DiscoveryTag(slug = slug, name = name, postCount = postCount)

private fun org.omicron.mobile.data.api.TagDetailDto.toDomain() =
    TagDetail(
        slug = tag.slug,
        name = tag.name,
        postCount = postCount,
        followerCount = followerCount,
        isFollowing = isFollowing,
    )
