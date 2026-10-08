package org.omicron.mobile.feature.discovery

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.io.IOException
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.omicron.mobile.core.designsystem.OmicronTheme
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
import org.omicron.mobile.domain.model.InstanceConfiguration

@RunWith(AndroidJUnit4::class)
class R4JourneyTest {
    @get:Rule
    val composeTestRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun searchShowsPromptBeforeFirstQuery() {
        val viewModel = SearchViewModel(DiscoveryRepository(JourneyDiscoveryApi(), savedInstance = { instance() }))

        composeTestRule.setContent {
            OmicronTheme {
                SearchRoute(viewModel = viewModel, onBack = {}, onOpenDiscover = {}, onOpenPost = {}, onOpenProfile = {}, onOpenTag = {})
            }
        }

        composeTestRule.onNodeWithText("Find articles", substring = true).assertIsDisplayed()
    }

    @Test
    fun searchQueryShowsArticlesTagsAndPeopleTabs() {
        val viewModel = SearchViewModel(DiscoveryRepository(JourneyDiscoveryApi(), savedInstance = { instance() }))

        composeTestRule.setContent {
            OmicronTheme {
                SearchRoute(viewModel = viewModel, onBack = {}, onOpenDiscover = {}, onOpenPost = {}, onOpenProfile = {}, onOpenTag = {})
            }
        }

        composeTestRule.onNodeWithText("Search articles and people").performTextInput("hello")
        composeTestRule.onNode(hasClickAction() and hasText("Search", substring = true)).performClick()

        composeTestRule.waitUntil(timeoutMillis = 5_000) {
            composeTestRule.onAllNodesWithText("Articles (1)", substring = false).fetchSemanticsNodes().isNotEmpty()
        }
        composeTestRule.onNodeWithText("Tags (1)", substring = false).assertIsDisplayed()
        composeTestRule.onNodeWithText("People (1)", substring = false).assertIsDisplayed()
    }

    @Test
    fun searchOfflineOffersRetry() {
        val viewModel = SearchViewModel(DiscoveryRepository(JourneyDiscoveryApi(failSearchFirst = true), savedInstance = { instance() }))

        composeTestRule.setContent {
            OmicronTheme {
                SearchRoute(viewModel = viewModel, onBack = {}, onOpenDiscover = {}, onOpenPost = {}, onOpenProfile = {}, onOpenTag = {})
            }
        }

        composeTestRule.onNodeWithText("Search articles and people").performTextInput("hello")
        composeTestRule.onNode(hasClickAction() and hasText("Search", substring = true)).performClick()

        composeTestRule.waitUntil(timeoutMillis = 5_000) {
            composeTestRule.onAllNodesWithText("offline", substring = true).fetchSemanticsNodes().isNotEmpty()
        }
        composeTestRule.onNodeWithText("Try again", substring = false).assertIsDisplayed()
    }

    @Test
    fun discoverRendersTrendingTopicsAndPeople() {
        val viewModel = DiscoverViewModel(DiscoveryRepository(JourneyDiscoveryApi(), savedInstance = { instance() }))

        composeTestRule.setContent {
            OmicronTheme {
                DiscoverRoute(viewModel = viewModel, onBack = {}, onOpenSearch = {}, onOpenPost = {}, onOpenProfile = {}, onOpenTag = {})
            }
        }

        composeTestRule.waitUntil(timeoutMillis = 5_000) {
            composeTestRule.onAllNodesWithText("Trending", substring = false).fetchSemanticsNodes().isNotEmpty()
        }
        composeTestRule.onNodeWithText("Topics", substring = false).assertIsDisplayed()
        composeTestRule.onNodeWithText("Who to follow", substring = false).assertIsDisplayed()
    }

    @Test
    fun discoverOfflineOffersRetry() {
        val viewModel = DiscoverViewModel(DiscoveryRepository(JourneyDiscoveryApi(failDiscoverFirst = true), savedInstance = { instance() }))

        composeTestRule.setContent {
            OmicronTheme {
                DiscoverRoute(viewModel = viewModel, onBack = {}, onOpenSearch = {}, onOpenPost = {}, onOpenProfile = {}, onOpenTag = {})
            }
        }

        composeTestRule.waitUntil(timeoutMillis = 5_000) {
            composeTestRule.onAllNodesWithText("Try again", substring = false).fetchSemanticsNodes().isNotEmpty()
        }
    }

    @Test
    fun tagPageShowsHeaderCountsAndPosts() {
        val viewModel = TagViewModel(DiscoveryRepository(JourneyDiscoveryApi(), savedInstance = { instance() }), "technology")

        composeTestRule.setContent {
            OmicronTheme {
                TagRoute(viewModel = viewModel, onBack = {}, onSignIn = {}, onOpenPost = {})
            }
        }

        composeTestRule.waitUntil(timeoutMillis = 5_000) {
            composeTestRule.onAllNodesWithText("#Technology", substring = false).fetchSemanticsNodes().isNotEmpty()
        }
        composeTestRule.onNodeWithText("Hello", substring = false).assertIsDisplayed()
    }
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

private fun journeyPost(id: String) =
    PostDto(
        id = id,
        title = "Hello",
        contentHtml = "<p>Hello</p>",
        createdAt = "2026-01-01T00:00:00Z",
        author = PostAuthorDto("user-1", "alice", "Alice"),
    )

private class JourneyDiscoveryApi(
    private val failSearchFirst: Boolean = false,
    private val failDiscoverFirst: Boolean = false,
) : DiscoveryApi {
    private var searchCalls = 0
    private var discoverCalls = 0

    override suspend fun search(
        origin: String,
        query: String,
        scope: SearchScope?,
        tag: String?,
        author: String?,
        accessToken: String?,
    ): SearchResultsDto {
        searchCalls += 1
        if (failSearchFirst && searchCalls == 1) throw IOException("unresolved")
        return SearchResultsDto(
            posts = listOf(journeyPost("post-1")),
            people = listOf(DiscoveryPersonDto("user-1", "alice", "Alice")),
            tags = listOf(DiscoveryTagDto("technology", "Technology", 4)),
        )
    }

    override suspend fun trendingPosts(origin: String, accessToken: String?): List<PostDto> {
        discoverCalls += 1
        if (failDiscoverFirst && discoverCalls == 1) throw IOException("unresolved")
        return listOf(journeyPost("post-1"))
    }

    override suspend fun trendingTags(origin: String, accessToken: String?): List<DiscoveryTagDto> =
        listOf(DiscoveryTagDto("technology", "Technology", 4))

    override suspend fun suggestedUsers(origin: String, accessToken: String?): List<SuggestedUserDto> =
        listOf(SuggestedUserDto("user-2", "bob", "Bob", followerCount = 3))

    override suspend fun tagDetail(origin: String, slug: String, accessToken: String?): TagDetailDto =
        TagDetailDto(TagDto("technology", "Technology"), postCount = 1, followerCount = 2)

    override suspend fun tagPosts(origin: String, slug: String, cursor: String?, accessToken: String?): TimelinePageDto =
        TimelinePageDto(listOf(journeyPost("post-1")), null)

    override suspend fun setTagFollow(origin: String, slug: String, following: Boolean, accessToken: String) = Unit
}
