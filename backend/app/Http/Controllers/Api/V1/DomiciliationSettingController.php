<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateDomiciliationSettingRequest;
use App\Models\DomiciliationSetting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class DomiciliationSettingController extends Controller
{
    public function show()
    {
        return DomiciliationSetting::firstOrCreate([]);
    }

    public function update(UpdateDomiciliationSettingRequest $request)
    {
        $settings = DomiciliationSetting::firstOrCreate([]);
        $settings->update($request->validated());

        return $settings->fresh();
    }

    public function uploadLogo(Request $request)
    {
        $request->validate(['file' => ['required', 'image', 'mimes:jpg,jpeg,png,gif', 'max:800']]);
        $settings = DomiciliationSetting::firstOrCreate([]);
        if ($settings->logo_path) {
            Storage::disk('public')->delete($settings->logo_path);
        }
        $settings->update(['logo_path' => $request->file('file')->store('settings/domiciliation', 'public')]);

        return $settings->fresh();
    }

    public function resetLogo()
    {
        $settings = DomiciliationSetting::firstOrCreate([]);
        if ($settings->logo_path) {
            Storage::disk('public')->delete($settings->logo_path);
        }
        $settings->update(['logo_path' => null]);

        return $settings->fresh();
    }

    public function uploadSignature(Request $request)
    {
        $request->validate(['file' => ['required', 'image', 'mimes:jpg,jpeg,png,gif', 'max:800']]);
        $settings = DomiciliationSetting::firstOrCreate([]);
        if ($settings->signature_path) {
            Storage::disk('public')->delete($settings->signature_path);
        }
        $settings->update(['signature_path' => $request->file('file')->store('settings/domiciliation', 'public')]);

        return $settings->fresh();
    }

    public function resetSignature()
    {
        $settings = DomiciliationSetting::firstOrCreate([]);
        if ($settings->signature_path) {
            Storage::disk('public')->delete($settings->signature_path);
        }
        $settings->update(['signature_path' => null]);

        return $settings->fresh();
    }
}
