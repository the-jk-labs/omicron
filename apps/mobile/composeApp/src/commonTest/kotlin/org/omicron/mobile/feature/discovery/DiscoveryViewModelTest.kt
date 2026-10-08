package org.omicron.mobile.feature.discovery

import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.io.IOException
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
import org.omicron.mobile.data.repository.DiscoveryRepository
import org.omicron.mobile.data.repository.MissingInstanceException
import org.omicron.mobile.domain.model.InstanceConfiguration
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

class DiscoveryViewModelTest {
    @Test
    fun discoverLoadsAllThreeSections() = runTest {
        val viewModel = discoverViewModel()
        testScheduler.advanceUntilIdle()

        val state = viewModel.uiState.value
        assertIs<DiscoverPhase.Content>(state.phase)
        assertEquals(1, state.content.trendingPosts.size)
        assertEquals(1, state.content.topics.size)
        assertEquals(1, state.content.suggestedPeople.size)
    }

    @Test
    fun discoverShowsEmptyWhenEverySectionIsEmpty() = runTest {
        val api = StubDiscoveryApi(empty = true)
        val dispatcher = StandardTestDispatcher(testScheduler)
        val viewModel = DiscoverViewModel(DiscoveryRepository(api, savedInstance = { instance() }), TestScope(dispatcher))
        testScheduler.advanceUntilIdle()

        assertIs<DiscoverPhase.Empty>(viewModel.uiState.value.phase)
    }

    @Test
    fun discoverMapsOfflineFailures() = runTest {
        val viewModel = discoverViewModel(failure = IOException("unresolved"))
        testScheduler.advanceUntilIdle()

        assertEquals(DiscoverPhase.Error(DiscoverError.Offline), viewModel.uiState.value.phase)
    }

    @Test
    fun searchStaysIdleOnBlankQuery() = runTest {
        val viewModel = searchViewModel()
        testScheduler.advanceUntilIdle()

        viewModel.updateQuery("   ")
        viewModel.search()
        testScheduler.advanceUntilIdle()

        assertIs<SearchPhase.Idle>(viewModel.uiState.value.phase)
    }

    @Test
    fun searchShowsContentAndPrefersArticlesTab() = runTest {
        val viewModel = searchViewModel()
        testScheduler.advanceUntilIdle()

        viewModel.updateQuery("hello")
        viewModel.search()
        testScheduler.advanceUntilIdle()

        val state = viewModel.uiState.value
        assertIs<SearchPhase.Content>(state.phase)
        assertEquals(SearchTab.Articles, state.selectedTab)
        assertEquals(1, state.results.posts.size)
    }

    @Test
    fun searchShowsEmptyWhenNothingMatches() = runTest {
        val api = StubDiscoveryApi(empty = true)
        val dispatcher = StandardTestDispatcher(testScheduler)
        val viewModel = SearchViewModel(DiscoveryRepository(api, savedInstance = { instance() }), TestScope(dispatcher))
        testScheduler.advanceUntilIdle()

        viewModel.updateQuery("nothing-matches-this")
        viewModel.search()
        testScheduler.advanceUntilIdle()

        assertIs<SearchPhase.Empty>(viewModel.uiState.value.phase)
    }

    @Test
    fun tagLoadsDetailAndFirstPage() = runTest {
        val viewModel = tagViewModel()
        testScheduler.advanceUntilIdle()

        val state = viewModel.uiState.value
        assertIs<TagPhase.Content>(state.phase)
        assertEquals("technology", state.detail?.slug)
        assertEquals(listOf("post-1"), state.posts.map { it.id })
    }

    @Test
    fun tagLoadMorePreservesCursor() = runTest {
        val api = StubDiscoveryApi(paged = true)
        val dispatcher = StandardTestDispatcher(testScheduler)
        val viewModel = TagViewModel(DiscoveryRepository(api, savedInstance = { instance() }), "technology", TestScope(dispatcher))
        testScheduler.advanceUntilIdle()

        viewModel.loadMore()
        testScheduler.advanceUntilIdle()

        assertEquals(listOf(null, "cursor-1"), api.tagCursors)
    }

    @Test
    fun tagMapsMissingInstance() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val viewModel =
            TagViewModel(
                DiscoveryRepository(FailingDiscoveryApi(MissingInstanceException()), savedInstance = { null }),
                "technology",
                TestScope(dispatcher),
            )
        testScheduler.advanceUntilIdle()

        assertEquals(TagPhase.Error(TagError.MissingInstance), viewModel.uiState.value.phase)
    }

    private fun TestScope.discoverViewModel(failure: Throwable? = null): DiscoverViewModel {
        val api = if (failure == null) StubDiscoveryApi() else FailingDiscoveryApi(failure)
        val dispatcher = StandardTestDispatcher(testScheduler)
        return DiscoverViewModel(DiscoveryRepository(api, savedInstance = { instance() }), TestScope(dispatcher))
    }

    private fun TestScope.searchViewModel(): SearchViewModel {
        val dispatcher = StandardTestDispatcher(testScheduler)
        return SearchViewModel(DiscoveryRepository(StubDiscoveryApi(), savedInstance = { instance() }), TestScope(dispatcher))
    }

    private fun TestScope.tagViewModel(): TagViewModel {
        val dispatcher = StandardTestDispatcher(testScheduler)
        return TagViewModel(DiscoveryRepository(StubDiscoveryApi(), savedInstance = { instance() }), "technology", TestScope(dispatcher))
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

    private class StubDiscoveryApi(
        private val empty: Boolean = false,
        private val paged: Boolean = false,
    ) : DiscoveryApi {
        val tagCursors = mutableListOf<String?>()

        override suspend fun search(
            origin: String,
            query: String,
            scope: SearchScope?,
            tag: String?,
            author: String?,
            accessToken: String?,
        ): SearchResultsDto =
            if (empty) {
                SearchResultsDto()
            } else {
                SearchResultsDto(
                    posts = listOf(postDto("post-1")),
                    people = listOf(DiscoveryPersonDto("user-1", "alice", "Alice")),
                    tags = listOf(DiscoveryTagDto("technology", "Technology", 4)),
                )
            }

        override suspend fun trendingPosts(origin: String, accessToken: String?): List<PostDto> =
            if (empty) emptyList() else listOf(postDto("post-1"))

        override suspend fun trendingTags(origin: String, accessToken: String?): List<DiscoveryTagDto> =
            if (empty) emptyList() else listOf(DiscoveryTagDto("technology", "Technology", 4))

        override suspend fun suggestedUsers(origin: String, accessToken: String?): List<SuggestedUserDto> =
            if (empty) emptyList() else listOf(SuggestedUserDto("user-2", "bob", "Bob", followerCount = 3))

        override suspend fun tagDetail(origin: String, slug: String, accessToken: String?): TagDetailDto =
            TagDetailDto(TagDto(slug, slug), postCount = 1, followerCount = 2)

        override suspend fun tagPosts(origin: String, slug: String, cursor: String?, accessToken: String?): TimelinePageDto {
            tagCursors += cursor
            if (!paged) return TimelinePageDto(listOf(postDto("post-1")), null)
            return if (cursor == null) {
                TimelinePageDto(listOf(postDto("post-1")), "cursor-1")
            } else {
                TimelinePageDto(emptyList(), null)
            }
        }

        override suspend fun setTagFollow(origin: String, slug: String, following: Boolean, accessToken: String) = Unit

        private fun postDto(id: String) =
            PostDto(
                id = id,
                title = "Title $id",
                contentHtml = "<p>Body</p>",
                createdAt = "2026-01-01T00:00:00Z",
                author = PostAuthorDto("user-1", "alice", "Alice"),
            )
    }

    private class FailingDiscoveryApi(
        private val failure: Throwable,
    ) : DiscoveryApi {
        override suspend fun search(
            origin: String,
            query: String,
            scope: SearchScope?,
            tag: String?,
            author: String?,
            accessToken: String?,
        ): SearchResultsDto = throw failure

        override suspend fun trendingPosts(origin: String, accessToken: String?): List<PostDto> = throw failure

        override suspend fun trendingTags(origin: String, accessToken: String?): List<DiscoveryTagDto> = throw failure

        override suspend fun suggestedUsers(origin: String, accessToken: String?): List<SuggestedUserDto> = throw failure

        override suspend fun tagDetail(origin: String, slug: String, accessToken: String?): TagDetailDto = throw failure

        override suspend fun tagPosts(origin: String, slug: String, cursor: String?, accessToken: String?): TimelinePageDto = throw failure

        override suspend fun setTagFollow(origin: String, slug: String, following: Boolean, accessToken: String): Unit = throw failure
    }
}
