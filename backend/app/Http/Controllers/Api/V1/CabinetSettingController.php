<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateCabinetSettingRequest;
use App\Models\CabinetSetting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class CabinetSettingController extends Controller
{
    public function show()
    {
        return CabinetSetting::firstOrCreate([]);
    }

    public function update(UpdateCabinetSettingRequest $request)
    {
        $settings = CabinetSetting::firstOrCreate([]);
        $settings->update($request->validated());

        return $settings->fresh();
    }

    public function uploadLogo(Request $request)
    {
        $request->validate(['file' => ['required', 'image', 'mimes:jpg,jpeg,png,gif', 'max:800']]);
        $settings = CabinetSetting::firstOrCreate([]);
        if ($settings->logo_path) {
            Storage::disk('public')->delete($settings->logo_path);
        }
        $settings->update(['logo_path' => $request->file('file')->store('settings/cabinet', 'public')]);

        return $settings->fresh();
    }

    public function resetLogo()
    {
        $settings = CabinetSetting::firstOrCreate([]);
        if ($settings->logo_path) {
            Storage::disk('public')->delete($settings->logo_path);
        }
        $settings->update(['logo_path' => null]);

        return $settings->fresh();
    }

    public function uploadSignature(Request $request)
    {
        $request->validate(['file' => ['required', 'image', 'mimes:jpg,jpeg,png,gif', 'max:800']]);
        $settings = CabinetSetting::firstOrCreate([]);
        if ($settings->signature_path) {
            Storage::disk('public')->delete($settings->signature_path);
        }
        $settings->update(['signature_path' => $request->file('file')->store('settings/cabinet', 'public')]);

        return $settings->fresh();
    }

    public function resetSignature()
    {
        $settings = CabinetSetting::firstOrCreate([]);
        if ($settings->signature_path) {
            Storage::disk('public')->delete($settings->signature_path);
        }
        $settings->update(['signature_path' => null]);

        return $settings->fresh();
    }
}
