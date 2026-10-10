package org.omicron.mobile.feature.reader

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.hasAnyDescendant
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.ComposeTestRule
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.ClientRequestException
import io.ktor.client.request.get
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.io.IOException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.data.api.PostAuthorDto
import org.omicron.mobile.data.api.PostDto
import org.omicron.mobile.data.api.PostsApi
import org.omicron.mobile.data.api.TimelinePageDto
import org.omicron.mobile.data.api.TimelineScope
import org.omicron.mobile.data.repository.PostsRepository
import org.omicron.mobile.data.repository.UnauthorizedException
import org.omicron.mobile.domain.model.AuthenticatedSession
import org.omicron.mobile.domain.model.AuthenticatedUser
import org.omicron.mobile.domain.model.InstanceConfiguration

@RunWith(AndroidJUnit4::class)
class R2JourneyTest {
    @get:Rule
    val composeTestRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun guestTimelineOffersOnlyLocalAndGlobalTabs() {
        val viewModel = TimelineViewModel(PostsRepository(JourneyPostsApi(), savedInstance = { instance() }))

        composeTestRule.setContent {
            OmicronTheme {
                TimelineRoute(viewModel = viewModel, onSignIn = {}, onChangeInstance = {}, onOpenPost = {})
            }
        }

        composeTestRule.onNodeWithText("Local", substring = true).assertIsDisplayed()
        composeTestRule.onNodeWithText("Global", substring = true).assertIsDisplayed()
        composeTestRule.onNodeWithText("Global", substring = true).assertIsSelected()
        composeTestRule.onNodeWithText("Local", substring = true).assertIsNotSelected()
        assertTrue(composeTestRule.onAllNodesWithText("For you", substring = true).fetchSemanticsNodes().isEmpty())
    }

    @Test
    fun expiredSessionOffersAWorkingSignInAction() {
        val session =
            MutableStateFlow<AuthenticatedSession?>(
                AuthenticatedSession(
                    AuthenticatedUser("user-1", "ada@example.com", "ada", "Ada"),
                    "signed-token",
                ),
            )
        val sessionExpired = MutableStateFlow(false)
        var signInRequested = false
        val viewModel =
            TimelineViewModel(
                PostsRepository(JourneyPostsApi(), savedInstance = { instance() }),
                session = session,
                sessionExpired = sessionExpired,
            )

        composeTestRule.setContent {
            OmicronTheme {
                TimelineRoute(
                    viewModel = viewModel,
                    onSignIn = { signInRequested = true },
                    onChangeInstance = {},
                    onOpenPost = {},
                )
            }
        }
        session.value = null
        sessionExpired.value = true
        composeTestRule.waitForText("Your session expired")
        composeTestRule.onNodeWithText("Sign in").performClick()

        assertTrue(signInRequested)
        viewModel.close()
    }

    @Test
    fun forYouTabLabelFitsOnOneLine() {
        val session =
            MutableStateFlow(
                AuthenticatedSession(
                    AuthenticatedUser("user-1", "ada@example.com", "ada", "Ada"),
                    "signed-token",
                ),
            )
        val viewModel =
            TimelineViewModel(
                PostsRepository(JourneyPostsApi(), savedInstance = { instance() }),
                session = session,
            )

        composeTestRule.setContent {
            OmicronTheme {
                TimelineRoute(viewModel = viewModel, onSignIn = {}, onChangeInstance = {}, onOpenPost = {})
            }
        }

        composeTestRule.waitForIdle()
        composeTestRule.waitForText("For you")
        val label = composeTestRule.onNodeWithText("For you", useUnmergedTree = true).fetchSemanticsNode()
        assertTrue(
            "For you label wrapped: ${label.size.height}px",
            label.size.height < composeTestRule.density.run { 30.dp.toPx() },
        )
    }

    @Test
    fun guestTimelineShowsPostsAndOpensDetail() {
        val api = JourneyPostsApi()
        var opened: String? = null
        val viewModel = TimelineViewModel(PostsRepository(api, savedInstance = { instance() }))

        composeTestRule.setContent {
            OmicronTheme {
                TimelineRoute(viewModel = viewModel, onSignIn = {}, onChangeInstance = {}, onOpenPost = { opened = it })
            }
        }
        composeTestRule.waitForText("Title post-1")
        composeTestRule.waitForText("Title post-2")

        composeTestRule
            .onNode(hasClickAction() and hasAnyDescendant(hasText("Title post-1", substring = true)), useUnmergedTree = true)
            .performClick()

        check(opened == "post-1")
        check(api.scopes == listOf(TimelineScope.Global))
        viewModel.close()
    }

    @Test
    fun emptyTimelineShowsEmptyState() {
        val viewModel = TimelineViewModel(PostsRepository(JourneyPostsApi(pages = emptyMap()), savedInstance = { instance() }))

        composeTestRule.setContent {
            OmicronTheme {
                TimelineRoute(viewModel = viewModel, onSignIn = {}, onChangeInstance = {}, onOpenPost = {})
            }
        }

        composeTestRule.waitForText("No posts yet")
        viewModel.close()
    }

    @Test
    fun offlineTimelineCanBeRetried() {
        val viewModel = TimelineViewModel(PostsRepository(JourneyPostsApi(failTimelineFirst = true), savedInstance = { instance() }))

        composeTestRule.setContent {
            OmicronTheme {
                TimelineRoute(viewModel = viewModel, onSignIn = {}, onChangeInstance = {}, onOpenPost = {})
            }
        }
        composeTestRule.waitForText("You appear to be offline")

        composeTestRule.onNodeWithContentDescription("Try again").performClick()
        composeTestRule.waitForText("Title post-1")
        viewModel.close()
    }

    @Test
    fun scopeSwitchLoadsLocalTimeline() {
        val api = JourneyPostsApi()
        val viewModel = TimelineViewModel(PostsRepository(api, savedInstance = { instance() }))

        composeTestRule.setContent {
            OmicronTheme {
                TimelineRoute(viewModel = viewModel, onSignIn = {}, onChangeInstance = {}, onOpenPost = {})
            }
        }
        composeTestRule.waitForText("Title post-1")

        composeTestRule.onNodeWithText("Local").performClick()
        composeTestRule.waitForText("Title local-1")

        check(api.scopes == listOf(TimelineScope.Global, TimelineScope.Local))
        viewModel.close()
    }

    @Test
    fun postDetailRendersNativeArticle() {
        var opened: String? = null
        val viewModel = PostDetailViewModel(PostsRepository(JourneyPostsApi(), savedInstance = { instance() }), "post-1")

        composeTestRule.setContent {
            OmicronTheme {
                PostDetailRoute(viewModel = viewModel, onBack = {}, onOpenPost = { opened = it }, onChangeInstance = {})
            }
        }
        composeTestRule.waitForText("Title post-1")
        composeTestRule.waitForText("Section")
        composeTestRule.waitForText("Hello")
        composeTestRule.waitForText("Ada")
        composeTestRule.waitForText("val x = 1")
        composeTestRule.waitForText("E = mc2")
        composeTestRule.waitForText("a⁄b")
        composeTestRule.waitForText("Read next")
        composeTestRule.waitForText("Title post-2")

        composeTestRule
            .onNode(hasClickAction() and hasAnyDescendant(hasText("Title post-2", substring = true)), useUnmergedTree = true)
            .performClick()

        check(opened == "post-2")
        viewModel.close()
    }

    @Test
    fun postDetailOfflineCanBeRetried() {
        val viewModel = PostDetailViewModel(PostsRepository(JourneyPostsApi(failDetailFirst = true), savedInstance = { instance() }), "post-1")

        composeTestRule.setContent {
            OmicronTheme {
                PostDetailRoute(viewModel = viewModel, onBack = {}, onOpenPost = {}, onChangeInstance = {})
            }
        }
        composeTestRule.waitForText("You appear to be offline")

        composeTestRule.onNodeWithContentDescription("Try again").performClick()
        composeTestRule.waitForText("Title post-1")
        viewModel.close()
    }

    @Test
    fun postDetailNotFoundShowsMissingPost() {
        val viewModel =
            PostDetailViewModel(
                PostsRepository(JourneyPostsApi(detailFailure = notFound()), savedInstance = { instance() }),
                "missing",
            )

        composeTestRule.setContent {
            OmicronTheme {
                PostDetailRoute(viewModel = viewModel, onBack = {}, onOpenPost = {}, onChangeInstance = {})
            }
        }

        composeTestRule.waitForText("Post not found")
        viewModel.close()
    }
}

private fun ComposeTestRule.waitForText(text: String) {
    waitUntil(timeoutMillis = 10_000) {
        onAllNodesWithText(text, substring = true).fetchSemanticsNodes().isNotEmpty()
    }
}

private fun notFound(): ClientRequestException =
    runBlocking {
        val client =
            HttpClient(
                MockEngine {
                    respond(content = """{"error":"not found"}""", status = HttpStatusCode.NotFound)
                },
            ) {
                expectSuccess = true
            }
        try {
            client.get("https://omicron.blog/api/posts/missing")
            error("expected 404")
        } catch (exception: ClientRequestException) {
            exception
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

private fun timelineDto(id: String) =
    PostDto(
        id = id,
        title = "Title $id",
        contentHtml = "<p>Body $id</p>",
        createdAt = "2026-01-01T00:00:00Z",
        author = PostAuthorDto("user-1", "alice", "Alice"),
    )

private fun detailDto(id: String) =
    PostDto(
        id = id,
        title = "Title $id",
        contentHtml =
            "<h2>Section</h2><p>Hello</p>" +
                "<table><thead><tr><th>Name</th></tr></thead><tbody><tr><td>Ada</td></tr></tbody></table>" +
                "<pre><code class=\"language-kotlin\">val x = 1</code></pre>" +
                "<p>Einstein wrote <span class=\"katex\"><math><semantics><mrow>" +
                "<mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup>" +
                "</mrow><annotation encoding=\"application/x-tex\">E = mc^2</annotation>" +
                "</semantics></math></span> once.</p>" +
                "<p class=\"katex-block\"><span class=\"katex\"><math display=\"block\"><semantics><mrow>" +
                "<mfrac><mi>a</mi><mi>b</mi></mfrac></mrow>" +
                "<annotation encoding=\"application/x-tex\">\\frac{a}{b}</annotation>" +
                "</semantics></math></span></p>",
        createdAt = "2026-01-01T00:00:00Z",
        author = PostAuthorDto("user-1", "alice", "Alice"),
    )

private class JourneyPostsApi(
    private val pages: Map<TimelineScope, List<PostDto>> =
        mapOf(
            TimelineScope.Global to listOf(timelineDto("post-1"), timelineDto("post-2")),
            TimelineScope.Local to listOf(timelineDto("local-1")),
        ),
    private val failTimelineFirst: Boolean = false,
    private val failDetailFirst: Boolean = false,
    private val detailFailure: Throwable? = null,
) : PostsApi {
    val scopes = mutableListOf<TimelineScope>()
    private var timelineCalls = 0
    private var detailCalls = 0

    override suspend fun timeline(
        origin: String,
        scope: TimelineScope,
        cursor: String?,
        accessToken: String?,
    ): TimelinePageDto {
        scopes += scope
        timelineCalls += 1
        if (failTimelineFirst && timelineCalls == 1) throw IOException("unresolved")
        return TimelinePageDto(items = pages[scope].orEmpty(), nextCursor = null)
    }

    override suspend fun post(
        origin: String,
        id: String,
        accessToken: String?,
    ): PostDto {
        detailCalls += 1
        detailFailure?.let { throw it }
        if (failDetailFirst && detailCalls == 1) throw IOException("unresolved")
        return if (id == "post-1") detailDto(id) else timelineDto(id)
    }

    override suspend fun relatedPosts(
        origin: String,
        id: String,
        accessToken: String?,
    ): List<PostDto> = listOf(timelineDto("post-2"))

    override suspend fun feed(
        origin: String,
        cursor: String?,
        accessToken: String,
    ): TimelinePageDto = throw UnauthorizedException()
}
