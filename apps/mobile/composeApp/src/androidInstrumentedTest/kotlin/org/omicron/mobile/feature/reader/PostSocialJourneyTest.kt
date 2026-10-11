package org.omicron.mobile.feature.reader

import android.graphics.Bitmap
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.TextContent
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import java.util.concurrent.atomic.AtomicBoolean
import java.io.File
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.io.IOException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.data.api.KtorPostsApi
import org.omicron.mobile.data.api.KtorSocialApi
import org.omicron.mobile.data.repository.PostsRepository
import org.omicron.mobile.data.repository.SocialRepository
import org.omicron.mobile.domain.model.AuthenticatedSession
import org.omicron.mobile.domain.model.AuthenticatedUser
import org.omicron.mobile.domain.model.InstanceConfiguration

@RunWith(AndroidJUnit4::class)
class PostSocialJourneyTest {
    @get:Rule
    val rule = createAndroidComposeRule<ComponentActivity>()

    private val failLike = AtomicBoolean()
    private val failCommentLike = AtomicBoolean()
    private val failComment = AtomicBoolean()
    private val forbidRecommendation = AtomicBoolean()
    private val unauthorizedLike = AtomicBoolean()
    private val mutations = AtomicInteger()
    private var signInRequests = 0
    private var client: HttpClient? = null
    private var detail: PostDetailViewModel? = null
    private lateinit var social: PostSocialViewModel

    @After
    fun close() {
        detail?.close()
        if (::social.isInitialized) social.close()
        client?.close()
    }

    @Test
    fun likesAndRecommendationsUseAuthoritativeCountsAndToggleBothWays() {
        show()
        rule.onNodeWithContentDescription("Like").performScrollTo().performClick()
        rule.waitUntil(5_000) { social.uiState.value.post?.likeCount == 7 && !social.uiState.value.likeBusy }
        rule.onNodeWithContentDescription("Like").assertIsSelected()
        rule.onNodeWithContentDescription("Recommend").performClick()
        rule.waitUntil(5_000) { social.uiState.value.post?.recommendCount == 4 && !social.uiState.value.recommendationBusy }
        rule.onNodeWithContentDescription("Recommend").assertIsSelected()
        rule.onNodeWithContentDescription("Like").performClick()
        rule.onNodeWithContentDescription("Recommend").performClick()
        rule.waitUntil(5_000) { mutations.get() == 4 && !social.uiState.value.likeBusy && !social.uiState.value.recommendationBusy }
        rule.onNodeWithContentDescription("Like").assertIsNotSelected()
        rule.onNodeWithContentDescription("Recommend").assertIsNotSelected()
        assertEquals(6, social.uiState.value.post?.likeCount)
        assertEquals(3, social.uiState.value.post?.recommendCount)
    }

    @Test
    fun offlineLikeHasAWorkingRetryAndForbiddenRecommendationHasExplicitFeedback() {
        failLike.set(true)
        show(dark = false)
        rule.onNodeWithContentDescription("Like").performScrollTo().performClick()
        waitForText(OFFLINE)
        rule.onNodeWithContentDescription("Like").assertIsNotSelected()
        rule.onNodeWithText("Try again").performScrollTo().performClick()
        rule.waitUntil(5_000) { social.uiState.value.post?.liked == true && !social.uiState.value.likeBusy }
        assertEquals(null, social.uiState.value.likeError)
        forbidRecommendation.set(true)
        rule.onNodeWithContentDescription("Recommend").performScrollTo().performClick()
        waitForText("This action is not allowed for your account.")
        assertFalse(social.uiState.value.post!!.recommended)
        assertTrue(social.uiState.value.post!!.liked)
    }

    @Test
    fun commentLikeFailureStaysWithTheCommentAndDoesNotAffectTheComposerDraft() {
        failCommentLike.set(true)
        show()
        social.updateDraft("An unfinished response")
        openResponses()
        capture("social-dark")
        rule.onNodeWithContentDescription("Like comment (0 likes)").performScrollTo().performClick()
        waitForText(OFFLINE)
        assertEquals(null, social.uiState.value.commentError)
        assertEquals("An unfinished response", social.uiState.value.draft)
        rule.onNodeWithText("Try again").performScrollTo().performClick()
        rule.waitUntil(5_000) { social.uiState.value.comments.single().liked && social.uiState.value.commentBusyIds.isEmpty() }
        rule.onNodeWithContentDescription("Unlike comment (2 likes)").assertIsSelected()
    }

    @Test
    fun failedReplyKeepsItsTargetAndMultilineDraftThenRetriesInTheSameThread() {
        failComment.set(true)
        show()
        openResponses()
        rule.onNodeWithText("Reply").performScrollTo().performClick()
        waitForText("Replying to Ada")
        rule.onNodeWithContentDescription("Write a reply").assertIsFocused().performTextReplacement("A reply\nwith two lines")
        rule.onNodeWithText("Respond").performScrollTo().performClick()
        waitForText(OFFLINE)
        assertEquals("comment-1", social.uiState.value.replyingTo)
        assertEquals("A reply\nwith two lines", social.uiState.value.draft)
        rule.onNodeWithText("Try again").performScrollTo().performClick()
        rule.waitUntil(5_000) { social.uiState.value.comments.single().replies.size == 1 && !social.uiState.value.commentBusy }
        assertEquals("comment-1", social.uiState.value.comments.single().replies.single().parentId)
        assertEquals("", social.uiState.value.draft)
        assertEquals(2, social.uiState.value.post?.commentCount)
    }

    @Test
    fun ownCommentCanBeEditedAndDeletionRequiresConfirmation() {
        show(dark = false)
        openResponses()
        capture("social-light")
        rule.onNodeWithText("Edit").performScrollTo().performClick()
        rule.onNodeWithContentDescription("Edit your comment").performTextReplacement("An edited response")
        rule.onNodeWithText("Save").performScrollTo().performClick()
        waitForText("An edited response")
        rule.onNodeWithText("Delete").performScrollTo().performClick()
        waitForText("Delete this response? This cannot be undone.")
        rule.onNodeWithText("Cancel").performClick()
        assertEquals(1, mutations.get())
        rule.onNodeWithText("Delete").performClick()
        rule.onNodeWithText("Delete").performClick()
        rule.waitUntil(5_000) { social.uiState.value.comments.isEmpty() && social.uiState.value.deleteBusyIds.isEmpty() }
        waitForText("No responses yet. Be the first.")
        assertEquals(0, social.uiState.value.post?.commentCount)
        assertEquals(2, mutations.get())
    }

    @Test
    fun guestSocialActionsOpenSignInWithoutMutating() {
        show(guest = true)
        rule.onNodeWithContentDescription("Like").performScrollTo().performClick()
        rule.onNodeWithContentDescription("Recommend").performClick()
        openResponses()
        rule.onNodeWithContentDescription("Like comment (0 likes)").performScrollTo().performClick()
        assertEquals(3, signInRequests)
        assertEquals(0, mutations.get())
    }

    @Test
    fun expiredSessionRollsBackTheLikeAndOffersSignInRecovery() {
        unauthorizedLike.set(true)
        show()
        rule.onNodeWithContentDescription("Like").performScrollTo().performClick()
        waitForText("Your session expired. Sign in to try again.")
        rule.onNodeWithText("Your session expired. Sign in to try again.").performScrollTo()
        assertFalse(social.uiState.value.signedIn)
        assertFalse(social.uiState.value.post!!.liked)
        assertTrue(social.uiState.value.sessionExpired)
        rule.onAllNodesWithText("Sign in").let { nodes -> nodes[nodes.fetchSemanticsNodes().lastIndex].performClick() }
        assertEquals(1, signInRequests)
        assertEquals(1, mutations.get())
    }

    @Test
    fun commentActionsWrapAndKeepTouchTargetsAtNarrowWidthAndLargeFontScale() {
        show(width = 320, fontScale = 1.5f)
        openResponses()
        listOf("Reply", "Edit", "Delete").forEach { label ->
            val node = rule.onNodeWithText(label).performScrollTo().assertIsDisplayed()
            val bounds = node.fetchSemanticsNode().boundsInRoot
            assertTrue("$label width: ${bounds.width}", bounds.width >= rule.density.run { 48.dp.toPx() })
            assertTrue("$label height: ${bounds.height}", bounds.height >= rule.density.run { 48.dp.toPx() })
            assertTrue(bounds.right <= rule.density.run { 320.dp.toPx() })
        }
        rule.onNodeWithContentDescription("Like comment (0 likes)").performScrollTo().assertIsNotSelected()
        capture("social-large-font")
    }

    private fun openResponses() {
        rule.onNodeWithContentDescription("Open responses").performScrollTo().performClick()
        waitForText("Responses (1)")
    }

    private fun waitForText(text: String) {
        rule.waitUntil(5_000) { rule.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty() }
    }

    private fun capture(name: String) {
        rule.onRoot().captureToImage().asAndroidBitmap().let { bitmap ->
            File(rule.activity.cacheDir, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        }
    }

    private fun show(guest: Boolean = false, dark: Boolean = true, width: Int = 360, fontScale: Float = 1f) {
        val http = HttpClient(MockEngine { request ->
            val path = request.url.encodedPath
            val writing = request.method != HttpMethod.Get
            if (writing) {
                check(request.headers[HttpHeaders.Origin] == "https://omicron.blog")
                check(request.headers[HttpHeaders.Authorization] == "Bearer signed-token")
                mutations.incrementAndGet()
            }
            if (path.endsWith("/comments/comment-1/like") && failCommentLike.getAndSet(false)) throw IOException("offline")
            if (path == "/api/posts/post-1/like" && failLike.getAndSet(false)) throw IOException("offline")
            if (path == "/api/posts/post-1/comments" && writing && failComment.getAndSet(false)) throw IOException("offline")
            if (path.endsWith("/recommend") && forbidRecommendation.get()) {
                return@MockEngine respond("""{"error":"Forbidden"}""", HttpStatusCode.Forbidden, headersOf(HttpHeaders.ContentType, "application/json"))
            }
            if (path == "/api/posts/post-1/like" && unauthorizedLike.get()) {
                return@MockEngine respond("""{"error":"You must be signed in."}""", HttpStatusCode.Unauthorized, headersOf(HttpHeaders.ContentType, "application/json"))
            }
            val body = when (path) {
                "/api/posts/post-1" -> """{"post":{"id":"post-1","title":"An article","contentHtml":"<p>Article body.</p>","createdAt":"2026-01-01T00:00:00Z","author":$AUTHOR,"likeCount":6,"recommendCount":3,"commentCount":1}}"""
                "/api/posts/post-1/related" -> """{"items":[]}"""
                "/api/lists/read-later" -> """{"list":{"id":"read-later","title":"Read later"}}"""
                "/api/lists/for-post/post-1" -> """{"lists":[]}"""
                "/api/posts/post-1/like" -> """{"likeCount":${if (request.method == HttpMethod.Post) 7 else 6},"liked":${request.method == HttpMethod.Post}}"""
                "/api/posts/post-1/recommend" -> """{"recommendCount":${if (request.method == HttpMethod.Post) 4 else 3},"recommended":${request.method == HttpMethod.Post}}"""
                "/api/posts/post-1/comments/comment-1/like" -> """{"likeCount":2,"liked":true}"""
                "/api/posts/post-1/comments/comment-1" -> if (request.method == HttpMethod.Patch) {
                    val content = Json.parseToJsonElement((request.body as TextContent).text).jsonObject.getValue("content")
                    """{"comment":{"id":"comment-1","content":$content}}"""
                } else """{"ok":true}"""
                "/api/posts/post-1/comments" -> if (!writing) {
                    """{"items":[$COMMENT],"nextCursor":null}"""
                } else {
                    val content = Json.parseToJsonElement((request.body as TextContent).text).jsonObject.getValue("content")
                    """{"comment":{"id":"created","content":$content,"createdAt":"2026-01-02T00:00:00Z","author":$AUTHOR,"parentId":"comment-1"}}"""
                }
                else -> error("Unexpected route: $path")
            }
            respond(body, headers = headersOf(HttpHeaders.ContentType, "application/json"))
        }) {
            expectSuccess = true
            install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
        }
        client = http
        val sessions = MutableStateFlow<AuthenticatedSession?>(if (guest) null else AuthenticatedSession(AuthenticatedUser("user-1", "ada@example.com", "ada", "Ada"), "signed-token"))
        val expired = MutableStateFlow(false)
        val token: suspend (String) -> String? = { sessions.value?.accessToken }
        val instance = InstanceConfiguration("https://omicron.blog", "Omicron", "omicron.blog", true, true, true, true)
        val postDetail = PostDetailViewModel(PostsRepository(KtorPostsApi(http), { instance }, token), "post-1", CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate))
        detail = postDetail
        social = PostSocialViewModel(
            SocialRepository(KtorSocialApi(http), { instance }, token, onUnauthorized = {
                sessions.value = null
                expired.value = true
            }),
            "post-1",
            CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
            session = sessions,
            sessionExpired = expired,
        )
        rule.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale)) {
                OmicronTheme(darkTheme = dark) {
                    Box(Modifier.width(width.dp)) {
                        PostDetailRoute(postDetail, onBack = {}, onOpenPost = {}, onChangeInstance = {}, socialViewModel = social, onSignIn = { signInRequests++ })
                    }
                }
            }
        }
        rule.waitUntil(5_000) { social.uiState.value.comments.size == 1 && !social.uiState.value.commentsLoading }
    }

    private companion object {
        const val OFFLINE = "You appear to be offline. Check your connection and try again."
        const val AUTHOR = """{"id":"user-1","username":"ada","displayName":"Ada","avatarUrl":null,"remote":false}"""
        const val COMMENT = """{"id":"comment-1","content":"A thoughtful response","createdAt":"2026-01-01T00:00:00Z","author":$AUTHOR,"likeCount":0,"liked":false,"replies":[]}"""
    }
}
