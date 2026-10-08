<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Notifications\ResetPasswordNotification;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'is_admin',
        'fonction',
        'telephone',
        'photo_path',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var array<int, string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'email_verified_at' => 'datetime',
        'is_admin' => 'boolean',
    ];

    /** Modules dont au moins une permission autorise à produire un document imprimable (PDF). */
    public const MODULES_IMPRESSION = ['facturation', 'paiements', 'domiciliation', 'mouvement'];

    /**
     * Peut imprimer : administrateur, ou titulaire d'au moins une permission des modules d'impression.
     * Ne donne AUCUN accès aux réglages : voir IdentiteImpressionController.
     */
    public function peutImprimer(): bool
    {
        if ($this->is_admin) {
            return true;
        }

        return $this->userPermissions()
            ->whereHas('permission', fn ($q) => $q->whereIn('module', self::MODULES_IMPRESSION))
            ->exists();
    }

    public function userPermissions()
    {
        return $this->hasMany(UserPermission::class);
    }

    /** Lien de réinitialisation vers la page React (SPA), pas une vue Blade. */
    public function sendPasswordResetNotification($token)
    {
        $this->notify(new ResetPasswordNotification($token));
    }

    /**
     * Règle d'autorisation unique du système :
     * - is_admin => accès métier total, sans jamais consulter user_permissions.
     * - non-admin => refusé sauf ligne explicite dans user_permissions.
     * `fonction` et un éventuel futur système de rôle ne sont JAMAIS lus ici.
     */
    public function hasPermission(string $module, string $action): bool
    {
        if ($this->is_admin) {
            return true;
        }

        return $this->userPermissions()
            ->whereHas('permission', fn ($q) => $q->where('module', $module)->where('action', $action))
            ->exists();
    }
}
