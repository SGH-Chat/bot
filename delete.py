from openai import OpenAI
client = OpenAI(api_key='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')
fine_tuned_model_ids = [
    "ft:gpt-4-2024-08-06:mm29942::-AD8x7p9N:ckpt-step-42",
    "ft:gpt-4-2024-08-06:mm29942::-AD8x84DQ:ckpt-step-48",
    "ft:gpt-4-2024-08-06:mm29942::-AD8x8iZO",
    "ft:gpt-4-2024-08-06:mm29942:e-invoicing:AD7ipR52:ckpt-step-42",
    "ft:gpt-4-2024-08-06:mm29942:e-invoicing:AD7ipvuj:ckpt-step-42",
    "ft:gpt-4-2024-08-06:mm29942:e-invoicing:AD7iqRa2",
    "ft:gpt-4-2024-08-06:mm29942:e-invoicing:AD7L3GPC",
    "ft:gpt-4-2024-08-06:mm29942:e-invoicing:AD7L3sFL:ckpt-step-42",
    "ft:gpt-4-2024-08-06:mm29942:e-invoicing:AD7L3Xmu:ckpt-step-36",
    "ft:gpt-4-2024-08-06:mm29942:ivibot2:A9Ue16wk",
    "ft:gpt-4-mini-2024-07-18:mm29942:ivibotmini:A9WbhqRt"
]
for model_id in fine_tuned_model_ids:
    try:
        print(f"Deleting model: {model_id}")
        client.models.delete(model_id)
        print(f"Successfully deleted model: {model_id}")
    except Exception as e:
        print(f"Error deleting model {model_id}: {e}")