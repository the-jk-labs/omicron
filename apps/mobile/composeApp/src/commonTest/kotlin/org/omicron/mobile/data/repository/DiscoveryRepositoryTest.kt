package org.omicron.mobile.data.repository

import kotlinx.coroutines.test.runTest
import org.omicron.mobile.data.api.DiscoveryApi
import org.omicron.mobile.data.api.DiscoveryPersonDto
import org.omicron.mobile.data.api.DiscoveryTagDto
import org.omicron.mobile.data.api.PostAuthorDto
import org.omicron.mobile.data.api.PostDto
import org.omicron.mobile.data.api.SearchResultsDto
import org.omicron.mobile.data.api.SearchScope
import org.omicron.mobile.data.api.SuggestedUserDto
import org.omicron.mobile.data.api.TagDetailDto
import org.omicron.mobile.data.api.TagDto
import org.omicron.mobile.data.api.TimelinePageDto
import org.omicron.mobile.domain.model.InstanceConfiguration
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

class DiscoveryRepositoryTest {
    @Test
    fun blankQueryReturnsEmptyWithoutCallingApi() = runTest {
        val api = RecordingDiscoveryApi()
        val repository = DiscoveryRepository(api, savedInstance = { instance() })

        val results = repository.search("   ")

        assertTrue(results.posts.isEmpty())
        assertTrue(results.people.isEmpty())
        assertTrue(results.tags.isEmpty())
        assertEquals(0, api.searchCalls)
    }

    @Test
    fun searchMapsResultsAndResolvesMediaUrls() = runTest {
        val api = RecordingDiscoveryApi()
        val repository = DiscoveryRepository(api, savedInstance = { instance() })

        val results = repository.search("hello", tag = "technology", author = "alice")

        assertEquals(listOf("hello"), api.queries)
        assertEquals("technology", api.lastTag)
        assertEquals("alice", api.lastAuthor)
        assertEquals("https://omicron.blog/uploads/cover.jpg", results.posts.first().bannerUrl)
        assertEquals("https://omicron.blog/uploads/avatar.png", results.people.first().avatarUrl)
        assertEquals("technology", results.tags.first().slug)
    }

    @Test
    fun tagPostsPreservesOpaqueCursor() = runTest {
        val api = RecordingDiscoveryApi(nextCursor = "opaque-next")
        val repository = DiscoveryRepository(api, savedInstance = { instance() })

        val page = repository.tagPosts("technology", "opaque-cursor-1")

        assertEquals(listOf<String?>("opaque-cursor-1"), api.tagCursors)
        assertEquals("opaque-next", page.nextCursor)
    }

    @Test
    fun missingInstanceThrowsBeforeNetwork() = runTest {
        val api = RecordingDiscoveryApi()
        val repository = DiscoveryRepository(api, savedInstance = { null })

        val failure =
            runCatching { repository.trendingPosts() }.exceptionOrNull()
        assertIs<MissingInstanceException>(failure)
        assertEquals(0, api.trendingCalls)
    }

    private fun instance() =
        InstanceConfiguration(
            origin = "https://omicron.blog",
            name = "Omicron",
            domain = "omicron.blog",
            federationEnabled = true,
            setupComplete = true,
            emailEnabled = true,
            emailVerificationRequired = true,
        )

    private class RecordingDiscoveryApi(
        private val nextCursor: String? = null,
    ) : DiscoveryApi {
        var searchCalls = 0
        var trendingCalls = 0
        val queries = mutableListOf<String>()
        var lastTag: String? = null
        var lastAuthor: String? = null
        val tagCursors = mutableListOf<String?>()

        override suspend fun search(
            origin: String,
            query: String,
            scope: SearchScope?,
            tag: String?,
            author: String?,
            accessToken: String?,
        ): SearchResultsDto {
            searchCalls += 1
            queries += query
            lastTag = tag
            lastAuthor = author
            return SearchResultsDto(
                posts =
                    listOf(
                        PostDto(
                            id = "post-1",
                            title = "Hello",
                            contentHtml = "<p>Hello</p>",
                            bannerUrl = "/uploads/cover.jpg",
                            createdAt = "2026-01-01T00:00:00Z",
                            author = PostAuthorDto("user-1", "alice", "Alice"),
                        ),
                    ),
                people =
                    listOf(
                        DiscoveryPersonDto("user-1", "alice", "Alice", "/uploads/avatar.png"),
                    ),
                tags = listOf(DiscoveryTagDto("technology", "Technology", 4)),
            )
        }

        override suspend fun trendingPosts(origin: String, accessToken: String?): List<PostDto> {
            trendingCalls += 1
            return emptyList()
        }

        override suspend fun trendingTags(origin: String, accessToken: String?): List<DiscoveryTagDto> = emptyList()

        override suspend fun suggestedUsers(origin: String, accessToken: String?): List<SuggestedUserDto> = emptyList()

        override suspend fun tagDetail(origin: String, slug: String, accessToken: String?): TagDetailDto =
            TagDetailDto(TagDto(slug, slug))

        override suspend fun tagPosts(origin: String, slug: String, cursor: String?, accessToken: String?): TimelinePageDto {
            tagCursors += cursor
            return TimelinePageDto(emptyList(), nextCursor)
        }

        override suspend fun setTagFollow(origin: String, slug: String, following: Boolean, accessToken: String) = Unit
    }
}
