package org.omicron.mobile.feature.auth

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.cookies.HttpCookies
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.CompletableDeferred
import kotlinx.serialization.json.Json
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.omicron.mobile.OmicronApp
import org.omicron.mobile.core.network.OriginCookiesStorage
import org.omicron.mobile.core.storage.AppearancePreferenceStore
import org.omicron.mobile.core.storage.InstanceStore
import org.omicron.mobile.core.storage.SessionCookieStore
import org.omicron.mobile.core.storage.StoredSessionCookie
import org.omicron.mobile.core.storage.HomeSnapshotStore
import org.omicron.mobile.data.api.KtorAuthoringApi
import org.omicron.mobile.data.api.KtorAuthApi
import org.omicron.mobile.data.api.KtorDiscoveryApi
import org.omicron.mobile.data.api.KtorInstanceApi
import org.omicron.mobile.data.api.KtorMobileWebApi
import org.omicron.mobile.data.api.KtorPostsApi
import org.omicron.mobile.data.api.KtorSocialApi
import org.omicron.mobile.data.repository.AuthoringRepository
import org.omicron.mobile.data.repository.AuthRepository
import org.omicron.mobile.data.repository.DiscoveryRepository
import org.omicron.mobile.data.repository.InstanceRepository
import org.omicron.mobile.data.repository.MobileWebRepository
import org.omicron.mobile.data.repository.PostsRepository
import org.omicron.mobile.data.repository.SocialRepository
import org.omicron.mobile.data.repository.HomeSnapshotRepository
import org.omicron.mobile.domain.model.AppearancePreference
import org.omicron.mobile.domain.model.InstanceConfiguration
import org.omicron.mobile.domain.model.AuthenticatedUser
import org.omicron.mobile.domain.model.HomeSnapshot
import org.omicron.mobile.domain.model.Post
import org.omicron.mobile.domain.model.PostAuthor

class StartupSessionJourneyTest {
    @get:Rule
    val rule = createAndroidComposeRule<ComponentActivity>()

    private var client: HttpClient? = null
    private val feedRequests = AtomicInteger()

    @After
    fun closeClient() {
        client?.close()
    }

    @Test
    fun reopeningWithASavedCookieRestoresTheSessionInTheHomeScreen() {
        val auth = showApp()

        rule.waitUntil(10_000) {
            rule.onAllNodesWithText("Connected to Omicron").fetchSemanticsNodes().isNotEmpty() ||
                rule.onAllNodesWithText("For you").fetchSemanticsNodes().isNotEmpty()
        }
        rule.onNodeWithText("For you").assertIsDisplayed()
        rule.onNodeWithText("Sign in").assertDoesNotExist()
        rule.onNodeWithText("Connected to Omicron").assertDoesNotExist()
        rule.onNodeWithText("Session restored").assertDoesNotExist()
        rule.waitUntil(10_000) { auth.currentSession() != null }
        assertEquals("ada", auth.currentSession()?.user?.username)
    }

    @Test
    fun returningGuestsOpenHomeWithoutAnAuthenticationRequest() {
        showApp(savedCookie = false)

        waitForText("Sign in")
        rule.onNodeWithText("Global").assertIsDisplayed()
        rule.onNodeWithText("Connected to Omicron").assertDoesNotExist()
        rule.onNodeWithContentDescription("Settings").performClick()
        waitForText("Change instance")
        rule.onNodeWithContentDescription("Change instance").performClick()
        waitForText("Connected to Omicron")
        rule.onNodeWithContentDescription("Continue").performClick()
        waitForText("Sign in")
    }

    @Test
    fun firstLaunchStillRequiresAnInstanceConnection() {
        showApp(savedInstance = false, savedCookie = false)

        waitForText("Choose an instance")
        rule.onNodeWithText("Sign in").assertDoesNotExist()
    }

    @Test
    fun anUnavailableSessionCanBeRetriedWithoutShowingSignedOutNavigation() {
        val offline = AtomicBoolean(true)
        val auth = showApp(offline = offline)

        waitForText("Could not refresh your session. Try again.")
        rule.onNodeWithText("Sign in").assertDoesNotExist()
        offline.set(false)
        rule.onNodeWithContentDescription("Try again").performClick()
        waitForText("For you")
        rule.waitUntil(10_000) { auth.currentSession() != null }
        assertEquals("ada", auth.currentSession()?.user?.username)
    }

    @Test
    fun anInvalidSavedSessionOpensGuestHome() {
        val auth = showApp(sessionExists = false)

        waitForText("Sign in")
        rule.onNodeWithText("Global").assertIsDisplayed()
        assertNull(auth.currentSession())
    }

    @Test
    fun homeOpensBeforeAuthenticationButFeedRequestsWaitForIt() {
        val sessionGate = CompletableDeferred<Unit>()
        showApp(sessionGate = sessionGate)

        waitForText("Loading posts")
        assertProgressCount(1)
        rule.onNodeWithText("Updating session").assertDoesNotExist()
        rule.onNodeWithText("For you").assertIsDisplayed()
        rule.onNodeWithText("Restoring session").assertDoesNotExist()
        rule.onNodeWithText("Sign in").assertDoesNotExist()
        rule.onNodeWithText("Connected to Omicron").assertDoesNotExist()
        assertEquals(0, feedRequests.get())
        sessionGate.complete(Unit)
        waitForText("For you")
    }

    @Test
    fun cachedHomeRemainsReadableWhenAuthenticationIsOfflineAndRetryRecovers() {
        val offline = AtomicBoolean(true)
        val auth = showApp(offline = offline, initialHome = cachedHome())

        waitForText("Could not refresh your session. Try again.")
        rule.onNodeWithText("Saved article").assertIsDisplayed()
        rule.onAllNodesWithText("Could not refresh your session. Try again.").assertCountEquals(1)
        assertProgressCount(0)
        rule.onNodeWithText("Profile").assertIsDisplayed()
        rule.onNodeWithText("Sign in").assertDoesNotExist()
        offline.set(false)
        rule.onNodeWithContentDescription("Try again").performClick()
        rule.waitUntil(10_000) { auth.currentSession() != null }
        assertEquals("ada", auth.currentSession()?.user?.username)
    }

    @Test
    fun cachedCardsAndAccountNavigationAppearBeforeDelayedAuthenticationAndRefresh() {
        val sessionGate = CompletableDeferred<Unit>()
        val feedGate = CompletableDeferred<Unit>()
        val auth = showApp(sessionGate = sessionGate, feedGate = feedGate, initialHome = cachedHome(), feedBody = freshPage)

        waitForText("Saved article")
        assertProgressCount(1)
        rule.onNodeWithText("Updating posts").assertIsDisplayed()
        rule.onNodeWithText("Updating session").assertDoesNotExist()
        rule.onNodeWithText("Showing saved posts").assertDoesNotExist()
        rule.onNodeWithText("Profile").assertIsDisplayed()
        rule.onNodeWithText("Restoring session").assertDoesNotExist()
        rule.onNodeWithContentDescription("Like").assertIsNotEnabled()
        assertNull(auth.currentSession())
        assertEquals(0, feedRequests.get())
        sessionGate.complete(Unit)
        rule.waitUntil(10_000) { auth.currentSession() != null && feedRequests.get() > 0 }
        rule.onNodeWithText("Saved article").assertIsDisplayed()
        assertProgressCount(1)
        rule.onNodeWithText("Updating posts").assertIsDisplayed()
        rule.onNodeWithContentDescription("Like").assertIsNotEnabled()
        feedGate.complete(Unit)
        waitForText("Fresh article")
        rule.onNodeWithText("Saved article").assertDoesNotExist()
        rule.onNodeWithContentDescription("Like").assertIsEnabled()
        assertProgressCount(0)
        rule.onNodeWithText("Updating posts").assertDoesNotExist()
    }

    @Test
    fun aSavedEmptyFeedUsesOneStatusUntilRefreshCompletes() {
        val sessionGate = CompletableDeferred<Unit>()
        val feedGate = CompletableDeferred<Unit>()
        val auth = showApp(sessionGate = sessionGate, feedGate = feedGate, initialHome = cachedHome().copy(posts = emptyList()))

        waitForText("Your feed is empty")
        assertProgressCount(1)
        rule.onNodeWithText("Updating posts").assertIsDisplayed()
        rule.onNodeWithText("Updating session").assertDoesNotExist()
        sessionGate.complete(Unit)
        rule.waitUntil(10_000) { auth.currentSession() != null && feedRequests.get() > 0 }
        assertProgressCount(1)
        feedGate.complete(Unit)
        rule.waitUntil(10_000) { rule.onAllNodesWithText("Updating posts").fetchSemanticsNodes().isEmpty() }
        assertProgressCount(0)
        rule.onNodeWithText("Your feed is empty").assertIsDisplayed()
    }

    @Test
    fun invalidAuthenticationDiscardsCachedAccountPostsInsteadOfShowingThemToGuests() {
        val gate = CompletableDeferred<Unit>()
        showApp(sessionExists = false, sessionGate = gate, initialHome = cachedHome())

        waitForText("Saved article")
        gate.complete(Unit)

        waitForText("Sign in")
        rule.onNodeWithText("Saved article").assertDoesNotExist()
        rule.onNodeWithText("Profile").assertDoesNotExist()
    }

    @Test
    fun aFailedFeedRefreshDoesNotReplaceSavedCardsWithAFullScreenError() {
        val offline = AtomicBoolean(true)
        showApp(initialHome = cachedHome(), feedOffline = offline, feedBody = freshPage)

        waitForText("Saved article")
        rule.waitUntil(10_000) { rule.onAllNodesWithText("Could not load posts. Check your connection and try again.").fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithText("Saved article").assertIsDisplayed()
        rule.onNodeWithContentDescription("Like").assertIsNotEnabled()
        assertProgressCount(0)
        offline.set(false)
        rule.onNodeWithContentDescription("Try again").performClick()
        waitForText("Fresh article")
        assertProgressCount(0)
    }

    @Test
    fun cachedHomeIsAvailableInLightAppearanceWhileAuthenticationIsPending() {
        val gate = CompletableDeferred<Unit>()
        showApp(sessionGate = gate, initialHome = cachedHome(), appearance = AppearancePreference.Light)

        waitForText("Saved article")
        assertProgressCount(1)
        rule.onNodeWithText("Updating session").assertDoesNotExist()
        rule.onNodeWithText("Profile").assertIsDisplayed()
        rule.onNodeWithContentDescription("Like").assertIsNotEnabled()
        gate.complete(Unit)
    }

    @Test
    fun forbiddenFeedAccessDiscardsSavedCardsWithoutPretendingTheAccountIsSignedOut() {
        val auth = showApp(initialHome = cachedHome(), feedForbidden = true)

        waitForText("You don’t have access to this feed.")
        rule.onNodeWithText("Saved article").assertDoesNotExist()
        rule.onNodeWithText("Profile").assertIsDisplayed()
        assertEquals("ada", auth.currentSession()?.user?.username)
        assertEquals(0, auth.homeSnapshot.value?.posts?.size)
    }

    @Test
    fun aRevokedSessionThatCannotMintATokenOpensGuestHome() {
        val auth = showApp(tokenUnauthorized = true)

        waitForText("Global")
        rule.onAllNodesWithText("Sign in")[0].assertIsDisplayed()
        assertNull(auth.currentSession())
    }

    private fun assertProgressCount(count: Int) {
        rule.onAllNodes(SemanticsMatcher.keyIsDefined(SemanticsProperties.ProgressBarRangeInfo)).assertCountEquals(count)
    }

    private fun waitForText(text: String) {
        rule.waitUntil(10_000) { rule.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithText(text).assertIsDisplayed()
    }

    private fun showApp(
        savedInstance: Boolean = true,
        savedCookie: Boolean = true,
        sessionExists: Boolean = true,
        offline: AtomicBoolean = AtomicBoolean(false),
        sessionGate: CompletableDeferred<Unit>? = null,
        tokenUnauthorized: Boolean = false,
        initialHome: HomeSnapshot? = null,
        feedGate: CompletableDeferred<Unit>? = null,
        feedBody: String = """{"items":[],"nextCursor":null}""",
        feedOffline: AtomicBoolean = AtomicBoolean(false),
        appearance: AppearancePreference = AppearancePreference.Dark,
        feedForbidden: Boolean = false,
    ): AuthRepository {
        val origin = "https://omicron.blog"
        val cookieStore = object : SessionCookieStore {
            private var cookies = if (savedCookie) listOf(StoredSessionCookie("omicron.session_token", "saved-session", null)) else emptyList()
            override suspend fun read(origin: String) = cookies
            override suspend fun write(origin: String, cookies: List<StoredSessionCookie>) {
                this.cookies = cookies
            }
        }
        val engine = MockEngine { request ->
            assertEquals("omicron.blog", request.url.host)
            if (request.url.encodedPath == "/api/auth/get-session" && offline.get()) {
                return@MockEngine respond("{}", HttpStatusCode.ServiceUnavailable, headersOf(HttpHeaders.ContentType, "application/json"))
            }
            if (request.url.encodedPath == "/api/auth/token" && tokenUnauthorized) {
                return@MockEngine respond("""{"code":"UNAUTHORIZED"}""", HttpStatusCode.Unauthorized, headersOf(HttpHeaders.ContentType, "application/json"))
            }
            val body = when (request.url.encodedPath) {
                "/api/auth/get-session" -> {
                    sessionGate?.await()
                    check(savedCookie)
                    assertEquals("omicron.session_token=saved-session", request.headers[HttpHeaders.Cookie])
                    if (sessionExists) """{"user":{"id":"ada","email":"ada@example.com","username":"ada","name":"Ada"},"session":{}}""" else "null"
                }
                "/api/auth/token" -> {
                    assertEquals("omicron.session_token=saved-session", request.headers[HttpHeaders.Cookie])
                    """{"token":"fresh-token"}"""
                }
                "/api/feed" -> {
                    feedRequests.incrementAndGet()
                    assertEquals("Bearer fresh-token", request.headers[HttpHeaders.Authorization])
                    feedGate?.await()
                    if (feedForbidden) return@MockEngine respond("{}", HttpStatusCode.Forbidden, headersOf(HttpHeaders.ContentType, "application/json"))
                    if (feedOffline.get()) return@MockEngine respond("{}", HttpStatusCode.ServiceUnavailable, headersOf(HttpHeaders.ContentType, "application/json"))
                    feedBody
                }
                "/api/posts" -> {
                    feedRequests.incrementAndGet()
                    """{"items":[],"nextCursor":null}"""
                }
                "/api/notifications/unread-count" -> """{"count":0}"""
                else -> error("Unexpected API request: ${request.url.encodedPath}")
            }
            respond(body, headers = headersOf(HttpHeaders.ContentType, "application/json"))
        }
        val httpClient = HttpClient(engine) {
            expectSuccess = true
            install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
            install(HttpCookies) { storage = OriginCookiesStorage(cookieStore) }
        }
        client = httpClient
        val instanceStore = object : InstanceStore {
            override suspend fun read() = if (savedInstance) InstanceConfiguration(origin, "Omicron", "omicron.blog", true, true, true, true) else null
            override suspend fun write(configuration: InstanceConfiguration) = Unit
        }
        val appearanceStore = object : AppearancePreferenceStore {
            override suspend fun read() = appearance
            override suspend fun write(preference: AppearancePreference) = Unit
        }
        val instances = InstanceRepository(KtorInstanceApi(httpClient), instanceStore)
        val homeStore = object : HomeSnapshotStore {
            private var value = initialHome
            override suspend fun read() = value
            override suspend fun write(snapshot: HomeSnapshot) { value = snapshot }
            override suspend fun clear() { value = null }
        }
        val snapshots = HomeSnapshotRepository(homeStore)
        val auth = AuthRepository(KtorAuthApi(httpClient), cookieStore, homeSnapshots = snapshots)
        assertNull(auth.currentSession())
        val posts = PostsRepository(KtorPostsApi(httpClient), instances::savedInstance, auth::accessToken, homeSnapshots = snapshots)
        val social = SocialRepository(KtorSocialApi(httpClient), instances::savedInstance, auth::accessToken)
        val discovery = DiscoveryRepository(KtorDiscoveryApi(httpClient), instances::savedInstance, auth::accessToken)
        val authoring = AuthoringRepository(KtorAuthoringApi(httpClient), instances::savedInstance, auth::accessToken)
        val mobileWeb = MobileWebRepository(KtorMobileWebApi(httpClient), instances::savedInstance, auth::accessToken)
        rule.setContent { OmicronApp(instances, auth, posts, social, discovery, authoring, mobileWeb, appearanceStore) }
        return auth
    }

    private fun cachedHome(): HomeSnapshot {
        val now = System.currentTimeMillis()
        val user = AuthenticatedUser("ada", "ada@example.com", "ada", "Ada")
        val post = Post("saved", "Saved article", "Saved preview", null, "2026-10-14T12:00:00Z", PostAuthor("author", "author", "Author", null, false), emptyList(), 0, 0, 0, false)
        return HomeSnapshot("https://omicron.blog", user, now, "ForYou", listOf(post), now)
    }

    private val freshPage = """{"items":[{"id":"fresh","title":"Fresh article","createdAt":"2026-10-14T12:00:00Z","author":{"id":"author","username":"author","displayName":"Author"}}],"nextCursor":null}"""
}
