<?php

namespace App\Notifications;

use Illuminate\Auth\Notifications\ResetPassword as BaseResetPassword;
use Illuminate\Notifications\Messages\MailMessage;

/**
 * Étend la notification Laravel standard (même génération/expiration de
 * token, même sécurité) — seule différence : le lien pointe vers la page
 * React du frontend (SPA, pas de vue Blade côté API) plutôt que vers une
 * route web qui n'existe pas dans cette application.
 */
class ResetPasswordNotification extends BaseResetPassword
{
    protected function resetUrl($notifiable)
    {
        $frontend = rtrim(config('app.frontend_url'), '/');

        return $frontend.'/#/reset-password?token='.$this->token
            .'&email='.urlencode($notifiable->getEmailForPasswordReset());
    }

    public function toMail($notifiable)
    {
        $url = $this->resetUrl($notifiable);

        return (new MailMessage)
            ->subject('Réinitialisation de votre mot de passe — '.config('app.name'))
            ->greeting('Bonjour,')
            ->line('Vous recevez cet email car une demande de réinitialisation de mot de passe a été effectuée pour votre compte.')
            ->action('Réinitialiser le mot de passe', $url)
            ->line('Ce lien expirera dans 60 minutes.')
            ->line("Si vous n'êtes pas à l'origine de cette demande, aucune action n'est nécessaire.");
    }
}
