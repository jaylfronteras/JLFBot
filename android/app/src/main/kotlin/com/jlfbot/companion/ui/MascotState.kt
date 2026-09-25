package com.jlfbot.companion.ui

import com.jlfbot.companion.core.Bot
import com.jlfbot.companion.core.Chat
import com.jlfbot.companion.core.CompanionState
import com.jlfbot.companion.core.Message

/**
 * Which face a bot wears — the desktop's `stateForBot`, ported from
 * `ios/App/MascotState.swift`.
 *
 * A pinned expression wins; then what the bot is doing right now; then a guess
 * from its role. Same rules, same order, so a bot looks the same on the phone as
 * on the laptop.
 */

/** The desktop's legacy names, kept so an older bot record still resolves. */
private val legacy: Map<String, JlfState> = mapOf(
    "deadpan" to JlfState.IDLE,
    "friendly" to JlfState.HAPPY,
    "focused" to JlfState.WORKING,
    "thinking" to JlfState.THINKING,
    "excited" to JlfState.EXCITED,
    "sleepy" to JlfState.DROWSY,
    "surprised" to JlfState.SURPRISED,
    "skeptical" to JlfState.SUSPICIOUS,
    "worried" to JlfState.SCARED,
    "mischievous" to JlfState.PLAYFUL,
)

private val byId: Map<String, JlfState> = JlfState.entries.associateBy(JlfState::id)

/**
 * A face a bot's description argues for, and the words that argue for it. Whole
 * words only: a "codebase" bot is not a coder, and "qa" must not match "aqua".
 */
private class RoleFace(val state: JlfState, words: List<String>) {
    private val patterns = words.map { Regex("\\b${Regex.escape(it)}\\b") }

    fun matches(profile: String): Boolean = patterns.any { it.containsMatchIn(profile) }
}

/** In order: the first that matches wins, as on the desktop. */
private val roleFaces: List<RoleFace> = listOf(
    RoleFace(
        JlfState.WORKING,
        listOf("code", "coding", "developer", "development", "engineer", "engineering", "build", "debug", "program", "software"),
    ),
    RoleFace(
        JlfState.SEARCHING,
        listOf("research", "researcher", "search", "investigate", "strategy", "strategist", "study", "learn", "knowledge"),
    ),
    RoleFace(
        JlfState.EXCITED,
        listOf("marketing", "growth", "launch", "campaign", "social", "sales", "outreach", "brand"),
    ),
    RoleFace(
        JlfState.DROWSY,
        listOf("overnight", "night", "background", "async", "queue", "batch", "long-running"),
    ),
    RoleFace(
        JlfState.RADAR,
        listOf("monitor", "monitoring", "incident", "alert", "watch", "status", "uptime"),
    ),
    RoleFace(
        JlfState.SUSPICIOUS,
        listOf("review", "reviewer", "audit", "critic", "critique", "quality", "qa", "test", "legal"),
    ),
    RoleFace(
        JlfState.SCARED,
        listOf("security", "secure", "compliance", "risk", "privacy", "finance", "financial"),
    ),
    RoleFace(
        JlfState.PLAYFUL,
        listOf("design", "designer", "creative", "brainstorm", "art", "illustration", "music", "story"),
    ),
    RoleFace(
        JlfState.HAPPY,
        listOf("support", "help", "success", "onboarding", "coach", "teacher", "guide", "welcome"),
    ),
)

/** Resolves any stored value — current, legacy or junk — to a real state. */
internal fun JlfState.Companion.normalize(value: String?): JlfState? {
    if (value.isNullOrEmpty()) return null
    return byId[value] ?: legacy[value]
}

internal fun JlfState.Companion.forBot(bot: Bot, last: Message?): JlfState {
    normalize(bot.mascotExpression)?.let { return it }

    if (last?.kind == Message.Kind.ACTIVITY && last.tool?.ok == false) return JlfState.ALERTING
    if (bot.busy == true) return JlfState.WORKING
    if (bot.unread) return JlfState.NOTIFYING
    if (last?.kind == Message.Kind.OPTIONS) return JlfState.CURIOUS

    val profile = "${bot.name} ${bot.title} ${bot.description}".lowercase()
    for (role in roleFaces) {
        if (role.matches(profile)) return role.state
    }
    return JlfState.IDLE
}

/**
 * The face for a chat as a whole: a bot's own, a room's is "happy" — which is what
 * the desktop draws for room avatars.
 */
internal fun JlfState.Companion.forChat(chat: Chat, state: CompanionState): JlfState =
    forChat(chat, state.visibleTranscript(chat.threadId).lastOrNull())

/** The same, for a caller that already walked the chat's visible transcript. */
internal fun JlfState.Companion.forChat(chat: Chat, last: Message?): JlfState = when (chat) {
    is Chat.BotChat -> forBot(chat.bot, last)
    is Chat.RoomChat -> JlfState.HAPPY
}
